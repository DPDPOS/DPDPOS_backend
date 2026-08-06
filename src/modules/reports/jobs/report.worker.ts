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

let worker: Worker | null = null;

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

      let dataForCsv: any[] = [];

      try {
        if (report.reportType === "VIOLATION_REPORT") {
          dataForCsv = await prisma.violation.findMany({
            where: { organizationId: report.organizationId },
          });
        } else if (report.reportType === "EVIDENCE_REPORT") {
          dataForCsv = await prisma.evidenceFile.findMany({
            where: { organizationId: report.organizationId },
          });
        } else if (report.reportType === "VALIDATION_REPORT") {
          dataForCsv = await prisma.validationResult.findMany({
            where: { organizationId: report.organizationId },
            include: { run: true },
          });
        } else {
          // Dummy data for other reports
          dataForCsv = [
            { summary: `Summary for ${report.reportType}` },
            { generatedAt: new Date().toISOString() },
          ];
        }

        if (dataForCsv.length === 0) {
          dataForCsv = [{ message: "No data found for this report" }];
        }

        const rendered = report.format === "PDF"
          ? await renderPdf(dataForCsv)
          : report.format === "EXCEL"
            ? await renderExcel(dataForCsv)
            : Buffer.from(renderCsv(dataForCsv));
        const extension = report.format === "PDF" ? "pdf" : report.format === "EXCEL" ? "xml" : "csv";
        const contentType = report.format === "PDF"
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
    }
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
