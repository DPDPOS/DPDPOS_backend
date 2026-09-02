import type { ControlStatus, Prisma } from "@prisma/client";
import { prisma } from "../../../infrastructure/database/prisma-client.js";
import { DPDP_REGULATORY_DEADLINES } from "../../../shared/domain/dpdp.constants.js";
import {
  getDependencies,
  getAssessmentCodesForFramework,
} from "../../controls/domain/control-catalog.js";
import {
  ROADMAP_PHASE_ORDER,
  type FrameworkProfile,
  type RoadmapPhase,
} from "../domain/templates.js";
import { FrameworkRepository } from "../repositories/framework.repository.js";

const COMPLETED_STATUSES: ControlStatus[] = ["IMPLEMENTED", "VERIFIED"];
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const PHASE_GATE_PERCENT = 80;

export type RoadmapControlView = {
  id: string;
  code: string;
  title: string;
  phase: string | null;
  status: ControlStatus;
  dueAt: string | null;
  ownerUserId: string | null;
  overdue: boolean;
  sdfOverlay: boolean;
  atRisk: boolean;
  blockedBy: string[];
  assessmentStatus: string | null;
  openViolations: number;
  remediationCount: number;
  evidenceApprovedCount: number;
  requirements: Array<{
    id: string;
    code: string;
    title: string;
    status: string;
  }>;
};

export type RoadmapPhaseView = {
  name: RoadmapPhase;
  gatePercent: number;
  gateMet: boolean;
  progress: {
    total: number;
    notStarted: number;
    inProgress: number;
    implemented: number;
    verified: number;
    overdue: number;
    progressPercent: number;
  };
  controls: RoadmapControlView[];
};

export type LiveRoadmapResponse = {
  frameworkId: string;
  generatedAt: string;
  profile: FrameworkProfile | Record<string, unknown>;
  regulatoryMilestones: Array<{ label: string; date: string }>;
  summary: {
    controlCount: number;
    requirementCount: number;
    overallProgressPercent: number;
    assessmentFailCount: number;
    openViolationCount: number;
    overdueCount: number;
    byPhase: Record<
      string,
      {
        total: number;
        notStarted: number;
        inProgress: number;
        implemented: number;
        verified: number;
        overdue: number;
        progressPercent: number;
      }
    >;
  };
  phases: RoadmapPhaseView[];
};

function phaseProgress(controls: RoadmapControlView[]) {
  const total = controls.length;
  const notStarted = controls.filter((c) => c.status === "NOT_STARTED").length;
  const inProgress = controls.filter((c) => c.status === "IN_PROGRESS").length;
  const implemented = controls.filter((c) => c.status === "IMPLEMENTED").length;
  const verified = controls.filter((c) => c.status === "VERIFIED").length;
  const overdue = controls.filter((c) => c.overdue).length;
  const completed = implemented + verified;
  const progressPercent =
    total > 0 ? Math.round((completed / total) * 100) : 0;

  return {
    total,
    notStarted,
    inProgress,
    implemented,
    verified,
    overdue,
    progressPercent,
  };
}

function isPhaseGateMet(progress: ReturnType<typeof phaseProgress>): boolean {
  if (progress.total === 0) return true;
  const completed = progress.implemented + progress.verified;
  return Math.round((completed / progress.total) * 100) >= PHASE_GATE_PERCENT;
}

export class RoadmapService {
  constructor(private readonly repo = new FrameworkRepository()) {}

  async buildLiveRoadmap(
    organizationId: string,
    frameworkId?: string,
  ): Promise<LiveRoadmapResponse> {
    const framework = frameworkId
      ? await this.repo.findById({ organizationId, id: frameworkId })
      : await this.repo.findLatestForOrg({ organizationId });

    if (!framework) {
      throw new Error("Framework not found");
    }

    const controlIds = framework.controls.map((c) => c.id);
    const controlCodes = framework.controls.map((c) => c.code);

    const [violations, remediationTasks, evidenceCounts, latestAssessmentResults] =
      await Promise.all([
        prisma.violation.findMany({
          where: {
            organizationId,
            controlId: { in: controlIds },
            deletedAt: null,
            status: { notIn: ["CLOSED", "ARCHIVED"] },
          },
          select: { controlId: true, id: true },
        }),
        prisma.remediationTask.findMany({
          where: {
            organizationId,
            controlId: { in: controlIds },
            deletedAt: null,
            status: { notIn: ["CLOSED", "CANCELLED"] },
          },
          select: { controlId: true },
        }),
        prisma.evidenceFile.groupBy({
          by: ["controlId"],
          where: {
            organizationId,
            controlId: { in: controlIds },
            status: { in: ["APPROVED", "LOCKED"] },
            deletedAt: null,
          },
          _count: { id: true },
        }),
        this.getLatestAssessmentResults(organizationId, controlCodes),
      ]);

    const violationsByControl = new Map<string, number>();
    for (const v of violations) {
      if (v.controlId) {
        violationsByControl.set(
          v.controlId,
          (violationsByControl.get(v.controlId) ?? 0) + 1,
        );
      }
    }

    const remediationByControl = new Map<string, number>();
    for (const r of remediationTasks) {
      if (r.controlId) {
        remediationByControl.set(
          r.controlId,
          (remediationByControl.get(r.controlId) ?? 0) + 1,
        );
      }
    }

    const evidenceByControl = new Map<string, number>();
    for (const e of evidenceCounts) {
      if (e.controlId) {
        evidenceByControl.set(e.controlId, e._count.id);
      }
    }

    const now = Date.now();
    const completedCodes = new Set(
      framework.controls
        .filter((c) => COMPLETED_STATUSES.includes(c.status))
        .map((c) => c.code),
    );

    const controlViews: RoadmapControlView[] = framework.controls.map((c) => {
      const deps = getDependencies(c.code);
      const blockedBy = deps.filter((d) => !completedCodes.has(d));
      const assessmentCodes = getAssessmentCodesForFramework(c.code);
      const failResult = assessmentCodes
        .map((code) => latestAssessmentResults.get(code))
        .find((s) => s === "FAIL");

      return {
        id: c.id,
        code: c.code,
        title: c.title,
        phase: c.phase,
        status: c.status,
        dueAt: c.dueAt?.toISOString() ?? null,
        ownerUserId: c.ownerUserId,
        overdue: c.dueAt != null && c.dueAt.getTime() < now && !COMPLETED_STATUSES.includes(c.status),
        sdfOverlay: c.sdfOverlay,
        atRisk: failResult === "FAIL" || (violationsByControl.get(c.id) ?? 0) > 0,
        blockedBy,
        assessmentStatus: failResult ?? assessmentCodes.map((code) => latestAssessmentResults.get(code)).find(Boolean) ?? null,
        openViolations: violationsByControl.get(c.id) ?? 0,
        remediationCount: remediationByControl.get(c.id) ?? 0,
        evidenceApprovedCount: evidenceByControl.get(c.id) ?? 0,
        requirements: framework.requirements
          .filter((r) => r.controlId === c.id)
          .map((r) => ({
            id: r.id,
            code: r.code,
            title: r.title,
            status: r.status,
          })),
      };
    });

    const phaseGateMet = new Map<RoadmapPhase, boolean>();
    let priorGateMet = true;

    const phases: RoadmapPhaseView[] = ROADMAP_PHASE_ORDER.map((phaseName) => {
      const phaseControls = controlViews.filter((c) => c.phase === phaseName);
      const progress = phaseProgress(phaseControls);
      const gateMet = priorGateMet && isPhaseGateMet(progress);
      phaseGateMet.set(phaseName, gateMet);
      priorGateMet = gateMet;

      return {
        name: phaseName,
        gatePercent: PHASE_GATE_PERCENT,
        gateMet,
        progress,
        controls: phaseControls,
      };
    }).filter((p) => p.controls.length > 0);

    const allControls = controlViews;
    const totalCompleted = allControls.filter((c) =>
      COMPLETED_STATUSES.includes(c.status),
    ).length;

    const byPhase: LiveRoadmapResponse["summary"]["byPhase"] = {};
    for (const phase of phases) {
      byPhase[phase.name] = phase.progress;
    }

    const profile =
      (framework.roadmapJson as { profile?: FrameworkProfile } | null)?.profile ??
      {};

    return {
      frameworkId: framework.id,
      generatedAt: new Date().toISOString(),
      profile,
      regulatoryMilestones: [
        {
          label: "Consent Manager registration",
          date: DPDP_REGULATORY_DEADLINES.CONSENT_MANAGER_REGISTRATION,
        },
        {
          label: "Full DPDP compliance",
          date: DPDP_REGULATORY_DEADLINES.FULL_COMPLIANCE,
        },
      ],
      summary: {
        controlCount: allControls.length,
        requirementCount: framework.requirements.length,
        overallProgressPercent:
          allControls.length > 0
            ? Math.round((totalCompleted / allControls.length) * 100)
            : 0,
        assessmentFailCount: [...latestAssessmentResults.values()].filter(
          (s) => s === "FAIL",
        ).length,
        openViolationCount: violations.length,
        overdueCount: allControls.filter((c) => c.overdue).length,
        byPhase,
      },
      phases,
    };
  }

  async syncSnapshot(
    organizationId: string,
    frameworkId: string,
    updatedBy: string,
  ): Promise<void> {
    const live = await this.buildLiveRoadmap(organizationId, frameworkId);
    const snapshot = {
      generatedAt: live.generatedAt,
      profile: live.profile,
      summary: live.summary,
      regulatoryMilestones: live.regulatoryMilestones,
      phases: live.phases.map((p) => ({
        name: p.name,
        gateMet: p.gateMet,
        progress: p.progress,
        controls: p.controls.map((c) => ({
          code: c.code,
          title: c.title,
          status: c.status,
          dueAt: c.dueAt,
          overdue: c.overdue,
          atRisk: c.atRisk,
          sdfOverlay: c.sdfOverlay,
        })),
      })),
    };

    await prisma.framework.update({
      where: { id: frameworkId },
      data: {
        roadmapJson: snapshot as Prisma.InputJsonValue,
        updatedBy,
      },
    });
  }

  private async getLatestAssessmentResults(
    organizationId: string,
    frameworkControlCodes: string[],
  ): Promise<Map<string, string>> {
    const assessmentCodes = new Set<string>();
    for (const code of frameworkControlCodes) {
      for (const ac of getAssessmentCodesForFramework(code)) {
        assessmentCodes.add(ac);
      }
    }

    if (assessmentCodes.size === 0) return new Map();

    const latest = await prisma.assessment.findFirst({
      where: { organizationId, deletedAt: null, status: "EVALUATED" },
      orderBy: { updatedAt: "desc" },
      select: { id: true, currentVersion: true },
    });

    if (!latest) return new Map();

    const results = await prisma.assessmentControlResult.findMany({
      where: {
        organizationId,
        assessmentId: latest.id,
        versionNumber: latest.currentVersion,
        controlCode: { in: [...assessmentCodes] },
      },
      select: { controlCode: true, status: true },
    });

    return new Map(results.map((r) => [r.controlCode, r.status]));
  }
}

export const roadmapService = new RoadmapService();
