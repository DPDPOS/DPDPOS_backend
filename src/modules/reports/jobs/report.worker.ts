import { Worker } from "bullmq";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { createBullMqConnectionOptions } from "../../../infrastructure/queue/bullmq-connection.js";
import { QUEUE_NAMES } from "../../../jobs/queues/queue-names.js";
import { logger } from "../../../infrastructure/logging/logger.js";
import { prisma } from "../../../infrastructure/database/prisma-client.js";
import { renderCsv } from "../../../infrastructure/reporting/csv-renderer.js";
import { renderPdf } from "../../../infrastructure/reporting/pdf-renderer.js";
import { renderExcel } from "../../../infrastructure/reporting/excel-renderer.js";
import { getS3Client } from "../../../infrastructure/storage/s3-adapter.js";
import { s3Config } from "../../../config/s3.config.js";
import { writeOutboxEvent } from "../../../events/outbox/outbox.repository.js";
import { DOMAIN_EVENTS } from "../../../events/types/base-event.interface.js";
import { SYSTEM_ACTOR_ID } from "../../../shared/constants/system-actor.js";
import { resolveAuditCatalog } from "../../audit/domain/audit-catalog.js";

let worker: Worker | null = null;

type DateParams = { dateFrom?: string; dateTo?: string };

function dateFilter(params: DateParams) {
  if (!params.dateFrom && !params.dateTo) return undefined;
  return {
    ...(params.dateFrom ? { gte: new Date(params.dateFrom) } : {}),
    ...(params.dateTo ? { lte: new Date(params.dateTo) } : {}),
  };
}

async function buildComplianceSummary(organizationId: string) {
  const publishedFramework = await prisma.framework.findFirst({
    where: { organizationId, status: "PUBLISHED", deletedAt: null },
    orderBy: { publishedAt: "desc" },
    select: { id: true, name: true },
  });

  const controlWhere = {
    organizationId,
    deletedAt: null,
    ...(publishedFramework
      ? { frameworkId: publishedFramework.id }
      : {}),
  };

  const [
    validationStats,
    controls,
    evidenceByControl,
    openViolations,
    live,
  ] = await Promise.all([
    prisma.validationResult.groupBy({
      by: ["resultStatus"],
      where: { organizationId, deletedAt: null },
      _count: true,
    }),
    prisma.control.findMany({
      where: controlWhere,
      select: { id: true, code: true, title: true, status: true, dueAt: true },
      orderBy: { code: "asc" },
    }),
    prisma.evidenceFile.groupBy({
      by: ["controlId"],
      where: {
        organizationId,
        deletedAt: null,
        controlId: { not: null },
        status: { in: ["APPROVED", "LOCKED"] },
      },
      _count: true,
    }),
    prisma.violation.groupBy({
      by: ["severity"],
      where: {
        organizationId,
        deletedAt: null,
        status: { notIn: ["CLOSED", "ARCHIVED"] },
      },
      _count: true,
    }),
    (async () => {
      try {
        const { roadmapService } = await import(
          "../../framework/services/roadmap.service.js"
        );
        return roadmapService.buildLiveRoadmap(
          organizationId,
          publishedFramework?.id,
        );
      } catch {
        return null;
      }
    })(),
  ]);

  const passed =
    validationStats.find((s) => s.resultStatus === "PASS")?._count ?? 0;
  const failed =
    validationStats.find((s) => s.resultStatus === "FAIL")?._count ?? 0;
  const totalRules = passed + failed;
  const score =
    totalRules > 0 ? Math.round((passed / totalRules) * 1000) / 10 : 0;

  const withEvidence = new Set(
    evidenceByControl.map((e) => e.controlId).filter(Boolean),
  );
  const controlsWithEvidence = controls.filter((c) => withEvidence.has(c.id));
  const missingEvidenceCodes = [
    ...new Set(
      controls.filter((c) => !withEvidence.has(c.id)).map((c) => c.code),
    ),
  ].sort();

  const implemented = controls.filter(
    (c) => c.status === "IMPLEMENTED" || c.status === "VERIFIED",
  ).length;
  const overdue = controls.filter(
    (c) =>
      c.dueAt != null &&
      c.dueAt < new Date() &&
      c.status !== "IMPLEMENTED" &&
      c.status !== "VERIFIED",
  );

  const rows: Record<string, unknown>[] = [
    {
      section: "Executive Summary",
      framework: publishedFramework?.name ?? "No published framework",
      complianceScorePercent: score,
      validationPassed: passed,
      validationFailed: failed,
      controlsImplemented: `${implemented}/${controls.length}`,
      evidenceCoveragePercent:
        controls.length > 0
          ? Math.round((controlsWithEvidence.length / controls.length) * 1000) / 10
          : 0,
      openViolations: openViolations.reduce((n, v) => n + v._count, 0),
      overdueControls: overdue.length,
      roadmapProgressPercent: live?.summary.overallProgressPercent ?? 0,
    },
  ];

  if (openViolations.length > 0) {
    for (const v of openViolations) {
      rows.push({
        section: "Open Violations by Severity",
        severity: v.severity,
        count: v._count,
      });
    }
  } else {
    rows.push({
      section: "Open Violations by Severity",
      note: "None open",
    });
  }

  if (overdue.length > 0) {
    for (const c of overdue) {
      rows.push({
        section: "Overdue Controls",
        code: c.code,
        title: c.title,
        status: c.status,
        dueAt: c.dueAt?.toISOString().slice(0, 10),
      });
    }
  }

  rows.push({
    section: "Evidence Gaps",
    missingCount: missingEvidenceCodes.length,
    coveredCount: controlsWithEvidence.length,
    totalControls: controls.length,
  });
  for (const code of missingEvidenceCodes) {
    const control = controls.find((c) => c.code === code);
    rows.push({
      section: "Evidence Gaps",
      code,
      title: control?.title ?? "",
      status: control?.status ?? "",
    });
  }

  if (live) {
    for (const m of live.regulatoryMilestones) {
      rows.push({
        section: "Regulatory Milestones",
        milestone: m.label,
        date: m.date,
      });
    }
    for (const p of live.phases) {
      rows.push({
        section: "Phase Progress",
        phase: p.name,
        progressPercent: p.progress.progressPercent,
        gateMet: p.gateMet ? "Yes" : "No",
        controlCount: p.controls.length,
        implemented: p.progress.implemented,
        inProgress: p.progress.inProgress,
        overdue: p.progress.overdue,
      });
    }
    for (const p of live.phases) {
      for (const c of p.controls) {
        rows.push({
          section: `Controls — ${p.name}`,
          code: c.code,
          title: c.title,
          status: c.status,
          dueAt: c.dueAt?.slice(0, 10) ?? "—",
          overdue: c.overdue ? "Yes" : "No",
          atRisk: c.atRisk ? "Yes" : "No",
          evidenceApproved: c.evidenceApprovedCount,
          openViolations: c.openViolations,
        });
      }
    }
  }

  return rows;
}

export function startReportWorker(): void {
  if (worker) return;

  worker = new Worker(
    QUEUE_NAMES.REPORT,
    async (job) => {
      const { reportId } = job.data;
      if (!reportId) throw new Error("Missing reportId in job data");

      const report = await prisma.report.findUnique({
        where: { id: reportId },
      });

      if (!report) throw new Error(`Report ${reportId} not found`);

      await prisma.report.update({
        where: { id: reportId },
        data: { status: "GENERATING", startedAt: new Date() },
      });

      let dataForCsv: Record<string, unknown>[] = [];
      const params = (report.parameters ?? {}) as DateParams & {
        status?: string;
        controlId?: string;
        violationId?: string;
      };
      const createdAt = dateFilter(params);

      try {
        if (report.reportType === "VIOLATION_REPORT") {
          dataForCsv = await prisma.violation.findMany({
            where: {
              organizationId: report.organizationId,
              ...(createdAt ? { createdAt } : {}),
            },
          });
        } else if (report.reportType === "EVIDENCE_REPORT") {
          dataForCsv = await prisma.evidenceFile.findMany({
            where: {
              organizationId: report.organizationId,
              deletedAt: null,
              ...(params.status ? { status: params.status as never } : {}),
              ...(params.controlId ? { controlId: params.controlId } : {}),
              ...(params.violationId ? { violationId: params.violationId } : {}),
              ...(createdAt ? { createdAt } : {}),
            },
            orderBy: { createdAt: "desc" },
          });
        } else if (report.reportType === "VALIDATION_REPORT") {
          dataForCsv = await prisma.validationResult.findMany({
            where: {
              organizationId: report.organizationId,
              ...(createdAt ? { createdAt } : {}),
            },
            include: { run: true },
          });
        } else if (report.reportType === "BOARD_PACK") {
          dataForCsv = await buildComplianceSummary(report.organizationId);
        } else if (report.reportType === "COMPLIANCE_SUMMARY") {
          dataForCsv = await buildComplianceSummary(report.organizationId);
        } else if (report.reportType === "CONSENT_REPORT") {
          dataForCsv = await prisma.consentRecord.findMany({
            where: {
              organizationId: report.organizationId,
              deletedAt: null,
              ...(createdAt ? { createdAt } : {}),
            },
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              dataSubjectIdentifier: true,
              purpose: true,
              consentState: true,
              grantedAt: true,
              withdrawnAt: true,
              noticeId: true,
              dataAssetId: true,
              createdAt: true,
            },
          });
        } else if (report.reportType === "RIGHTS_REPORT") {
          dataForCsv = await prisma.dataSubjectRequest.findMany({
            where: {
              organizationId: report.organizationId,
              deletedAt: null,
              ...(createdAt ? { createdAt } : {}),
            },
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              requestType: true,
              status: true,
              requesterReference: true,
              assignedTo: true,
              openedAt: true,
              dueAt: true,
              closedAt: true,
              resolutionSummary: true,
              createdAt: true,
            },
          });
        } else if (report.reportType === "AUDIT_REPORT") {
          const logs = await prisma.auditLog.findMany({
            where: {
              organizationId: report.organizationId,
              ...(createdAt ? { createdAt } : {}),
            },
            orderBy: { createdAt: "desc" },
            take: 10_000,
          });
          dataForCsv = logs.map((row) => {
            const catalog = resolveAuditCatalog(row.actionType);
            return {
              date: row.createdAt.toISOString(),
              action: row.actionType,
              description: catalog.description,
              entityType: row.entityType ?? catalog.entityType,
              entityId: row.entityId,
              actorUserId: row.actorUserId,
              ipAddress: row.ipAddress,
              userAgent: row.userAgent,
              correlationId: row.correlationId,
            };
          });
        } else {
          dataForCsv = [
            { summary: `Unsupported report type: ${report.reportType}` },
            { generatedAt: new Date().toISOString() },
          ];
        }

        if (dataForCsv.length === 0) {
          dataForCsv = [{ message: "No data found for this report" }];
        }

        const reportTitle =
          report.title ||
          report.reportType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

        const rendered =
          report.format === "PDF"
            ? await renderPdf(dataForCsv, { title: reportTitle })
            : report.format === "EXCEL"
              ? await renderExcel(dataForCsv)
              : Buffer.from(renderCsv(dataForCsv));
        const extension =
          report.format === "PDF"
            ? "pdf"
            : report.format === "EXCEL"
              ? "xml"
              : "csv";
        const contentType =
          report.format === "PDF"
            ? "application/pdf"
            : report.format === "EXCEL"
              ? "application/vnd.ms-excel"
              : "text/csv";
        const storageKey = `reports/${report.organizationId}/${reportId}.${extension}`;

        const s3Client = getS3Client();
        const command = new PutObjectCommand({
          Bucket: s3Config.bucket,
          Key: storageKey,
          Body: rendered,
          ContentType: contentType,
        });

        await s3Client.send(command);

        await prisma.$transaction(async (tx) => {
          await tx.report.update({
            where: { id: reportId },
            data: {
              status: "COMPLETED",
              storageKey,
              completedAt: new Date(),
            },
          });

          await writeOutboxEvent(tx, {
            eventType: DOMAIN_EVENTS.ReportGenerated,
            organizationId: report.organizationId,
            payload: {
              id: reportId,
              reportType: report.reportType,
              generatedBy: report.generatedBy,
              title: report.title,
            },
            actorUserId: SYSTEM_ACTOR_ID,
            correlationId: job.id,
          });
        });
      } catch (err: any) {
        logger.error({ reportId, err }, "Failed to generate report");
        await prisma.report.update({
          where: { id: reportId },
          data: { status: "FAILED", errorMessage: err.message },
        });
        throw err;
      }
    },
    {
      connection: createBullMqConnectionOptions(),
      concurrency: 5,
    },
  );

  worker.on("completed", (job) => {
    logger.debug({ jobId: job.id }, "report.job_completed");
  });

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, err }, "report.job_failed");
  });

  logger.info("report.worker_started");
}

export function stopReportWorker(): Promise<void> {
  if (!worker) return Promise.resolve();
  const w = worker;
  worker = null;
  return w.close();
}
