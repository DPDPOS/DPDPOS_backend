import { RemediationTaskStatus } from "@prisma/client";

/**
 * Remediation task lifecycle — pure domain object, no infrastructure.
 *
 *   PENDING → IN_PROGRESS → PENDING_VERIFICATION → VERIFIED → CLOSED
 *    │          │                │                  │
 *    └──────────┴────────────────┴──────────────────┴──▶ CANCELLED
 *
 * Invariants:
 *  - CLOSED is only reachable from VERIFIED — a remediation task cannot close
 *    without first being verified (verification before closure).
 *  - CANCELLED is terminal and reachable from any non-terminal state.
 */
export class RemediationTaskLifecycleStateMachine {
  private static readonly TRANSITIONS: Record<
    RemediationTaskStatus,
    Partial<Record<RemediationTaskStatus, string>>
  > = {
    PENDING: {
      IN_PROGRESS: "start",
      CANCELLED: "cancel",
    },
    IN_PROGRESS: {
      PENDING_VERIFICATION: "submit",
      CANCELLED: "cancel",
    },
    PENDING_VERIFICATION: {
      IN_PROGRESS: "rework",
      VERIFIED: "verify",
      CANCELLED: "cancel",
    },
    VERIFIED: {
      CLOSED: "close",
      CANCELLED: "cancel",
    },
    CLOSED: {},
    CANCELLED: {},
  };

  static canTransition(
    from: RemediationTaskStatus,
    to: RemediationTaskStatus,
  ): boolean {
    return to in this.TRANSITIONS[from];
  }

  static actionFor(
    from: RemediationTaskStatus,
    to: RemediationTaskStatus,
  ): string | null {
    return this.TRANSITIONS[from][to] ?? null;
  }

  static isTerminal(status: RemediationTaskStatus): boolean {
    return status === "CLOSED" || status === "CANCELLED";
  }

  static nextStatus(
    from: RemediationTaskStatus,
    to: RemediationTaskStatus,
  ): RemediationTaskStatus {
    if (!this.canTransition(from, to)) {
      throw new Error(
        `Illegal transition ${from} → ${to} in remediation task lifecycle`,
      );
    }
    return to;
  }
}
