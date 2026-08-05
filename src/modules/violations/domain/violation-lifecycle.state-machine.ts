import { ViolationStatus } from "@prisma/client";

/**
 * Violation lifecycle — pure domain object, no infrastructure.
 *
 *   OPEN → TRIAGE → ASSIGNED → IN_PROGRESS → PENDING_EVIDENCE → VALIDATED → CLOSED
 *    │       │         │          │              │                │
 *    └───────┴─────────┴──────────┴──────────────┴────────────────┴──▶ ARCHIVED
 *
 * Invariants:
 *  - CLOSED is only reachable from VALIDATED — a violation cannot close
 *    without first being validated.
 *  - ARCHIVED is terminal and reachable from any non-terminal state.
 */
export class ViolationLifecycleStateMachine {
  private static readonly TRANSITIONS: Record<
    ViolationStatus,
    Partial<Record<ViolationStatus, string>>
  > = {
    OPEN: {
      TRIAGE: "triage",
      ASSIGNED: "assign",
      ARCHIVED: "archive",
    },
    TRIAGE: {
      ASSIGNED: "assign",
      IN_PROGRESS: "start",
      ARCHIVED: "archive",
    },
    ASSIGNED: {
      IN_PROGRESS: "start",
      ARCHIVED: "archive",
    },
    IN_PROGRESS: {
      PENDING_EVIDENCE: "request_evidence",
      VALIDATED: "validate",
      ARCHIVED: "archive",
    },
    PENDING_EVIDENCE: {
      IN_PROGRESS: "submit_evidence",
      VALIDATED: "validate",
      ARCHIVED: "archive",
    },
    VALIDATED: {
      CLOSED: "close",
      ARCHIVED: "archive",
    },
    CLOSED: {},
    ARCHIVED: {},
  };

  static canTransition(
    from: ViolationStatus,
    to: ViolationStatus,
  ): boolean {
    return to in this.TRANSITIONS[from];
  }

  static actionFor(
    from: ViolationStatus,
    to: ViolationStatus,
  ): string | null {
    return this.TRANSITIONS[from][to] ?? null;
  }

  static isTerminal(status: ViolationStatus): boolean {
    return status === "CLOSED" || status === "ARCHIVED";
  }

  static nextStatus(
    from: ViolationStatus,
    to: ViolationStatus,
  ): ViolationStatus {
    if (!this.canTransition(from, to)) {
      throw new Error(
        `Illegal transition ${from} → ${to} in violation lifecycle`,
      );
    }
    return to;
  }
}
