import {
  DataSubjectRequestStatus,
  type DataSubjectRequestType,
} from "@prisma/client";

/**
 * Rights request lifecycle — pure domain object, no infrastructure.
 *
 *   SUBMITTED ─assign→ ASSIGNED ─start→ IN_PROGRESS ─respond→ RESPONDED ─close→ CLOSED
 *       │          │         │
 *       └──reject──┴─────────┴──reject──▶ REJECTED (terminal)
 *
 * Invariant: CLOSED is only reachable from RESPONDED — a request cannot be
 * closed without a logged resolution (PRD 10.4 "response log" + "closure
 * confirmation").
 */
export class RightsRequestStateMachine {
  private static readonly TRANSITIONS: Record<
    DataSubjectRequestStatus,
    Partial<Record<DataSubjectRequestStatus, string>>
  > = {
    SUBMITTED: {
      ASSIGNED: "assign",
      IN_PROGRESS: "start",
      REJECTED: "reject",
    },
    ASSIGNED: {
      IN_PROGRESS: "start",
      REJECTED: "reject",
    },
    IN_PROGRESS: {
      RESPONDED: "respond",
      REJECTED: "reject",
    },
    RESPONDED: {
      CLOSED: "close",
    },
    REJECTED: {},
    CLOSED: {},
  };

  /** Returns true when the transition is legal for this lifecycle. */
  static canTransition(
    from: DataSubjectRequestStatus,
    to: DataSubjectRequestStatus,
  ): boolean {
    return from === to || to in this.TRANSITIONS[from];
  }

  /** Human-readable action name for a legal transition (for error messages). */
  static actionFor(
    from: DataSubjectRequestStatus,
    to: DataSubjectRequestStatus,
  ): string | null {
    return this.TRANSITIONS[from][to] ?? null;
  }

  static isTerminal(status: DataSubjectRequestStatus): boolean {
    return status === "CLOSED" || status === "REJECTED";
  }

  /** Derives the next status for a request given the intended action. */
  static nextStatus(
    from: DataSubjectRequestStatus,
    to: DataSubjectRequestStatus,
  ): DataSubjectRequestStatus {
    if (!this.canTransition(from, to)) {
      throw new Error(
        `Illegal transition ${from} → ${to} in rights request lifecycle`,
      );
    }
    return to;
  }
}

/** DPDP-aligned default SLA for request types (days). */
export const RIGHTS_REQUEST_SLA_DAYS: Record<
  DataSubjectRequestType,
  number
> = {
  ACCESS: 30,
  CORRECTION: 30,
  COMPLETION: 30,
  UPDATING: 30,
  ERASURE: 30,
  GRIEVANCE_REDRESSAL: 45,
  NOMINATION: 30,
};

export const DEFAULT_RIGHTS_REQUEST_SLA_DAYS = 30;
