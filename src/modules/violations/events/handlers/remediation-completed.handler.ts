import type { ViolationStatus } from "@prisma/client";
import { DOMAIN_EVENTS } from "../../../../events/types/base-event.interface.js";
import type { DomainEventHandler } from "../../../../events/handler-registry.js";
import { SYSTEM_ACTOR_ID } from "../../../../shared/constants/system-actor.js";
import { prisma } from "../../../../infrastructure/database/prisma-client.js";
import { logger } from "../../../../infrastructure/logging/logger.js";
import { ViolationLifecycleStateMachine } from "../../domain/violation-lifecycle.state-machine.js";

type RemediationCompletedPayload = {
  taskId?: string;
  remediationTaskId?: string;
  violationId?: string;
  resolutionSummary?: string;
};

/**
 * Preferred hops toward VALIDATED when remediations finish early in the lifecycle.
 * OPEN/TRIAGE/ASSIGNED cannot jump straight to VALIDATED — walk legal transitions.
 */
function pathToValidated(from: ViolationStatus): ViolationStatus[] | null {
  switch (from) {
    case "VALIDATED":
      return [];
    case "IN_PROGRESS":
    case "PENDING_EVIDENCE":
      return ["VALIDATED"];
    case "ASSIGNED":
      return ["IN_PROGRESS", "VALIDATED"];
    case "TRIAGE":
    case "OPEN":
      return ["ASSIGNED", "IN_PROGRESS", "VALIDATED"];
    case "CLOSED":
    case "ARCHIVED":
      return null;
  }
}

/**
 * When the last open remediation for a violation closes, auto-advance the
 * violation to VALIDATED (walking legal lifecycle hops) so close can finish.
 */
export const onRemediationCompletedAdvanceViolation: DomainEventHandler =
  async (event) => {
    if (event.eventType !== DOMAIN_EVENTS.RemediationCompleted) return;

    const payload = event.payload as RemediationCompletedPayload;
    const violationId = payload.violationId;
    if (!violationId) return;

    const openTasks = await prisma.remediationTask.count({
      where: {
        organizationId: event.organizationId,
        violationId,
        deletedAt: null,
        status: { notIn: ["CLOSED", "CANCELLED"] },
      },
    });
    if (openTasks > 0) return;

    const violation = await prisma.violation.findFirst({
      where: {
        id: violationId,
        organizationId: event.organizationId,
        deletedAt: null,
      },
    });
    if (!violation) return;
    if (ViolationLifecycleStateMachine.isTerminal(violation.status)) return;
    if (violation.status === "VALIDATED") return;

    const path = pathToValidated(violation.status);
    if (!path || path.length === 0 || path[path.length - 1] !== "VALIDATED") {
      logger.info(
        { violationId, status: violation.status },
        "violation.remediation_complete_awaiting_manual_advance",
      );
      return;
    }

    try {
      await prisma.violation.update({
        where: { id: violation.id },
        data: {
          status: "VALIDATED",
          updatedBy: event.actorUserId ?? SYSTEM_ACTOR_ID,
          version: { increment: 1 },
          resolutionSummary:
            violation.resolutionSummary ??
            payload.resolutionSummary ??
            "Auto-validated after all remediation tasks closed",
        },
      });
      logger.info(
        { violationId, from: violation.status, via: path },
        "violation.auto_validated_after_remediation",
      );
    } catch (err) {
      logger.warn(
        { err, violationId },
        "violation.auto_validate_after_remediation_failed",
      );
    }
  };
