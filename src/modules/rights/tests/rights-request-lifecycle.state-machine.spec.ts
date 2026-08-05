import { describe, expect, it } from "vitest";

import {
  DEFAULT_RIGHTS_REQUEST_SLA_DAYS,
  RIGHTS_REQUEST_SLA_DAYS,
  RightsRequestStateMachine,
} from "../domain/rights-request-lifecycle.state-machine.js";

describe("RightsRequestStateMachine (RGT-002)", () => {
  it("accepts the legal lifecycle SUBMITTED → ASSIGNED → IN_PROGRESS → RESPONDED → CLOSED", () => {
    const path = [
      ["SUBMITTED", "ASSIGNED"],
      ["ASSIGNED", "IN_PROGRESS"],
      ["IN_PROGRESS", "RESPONDED"],
      ["RESPONDED", "CLOSED"],
    ] as const;

    for (const [from, to] of path) {
      expect(RightsRequestStateMachine.canTransition(from, to)).toBe(true);
    }
  });

  it("allows rejecting from any pre-closure working state", () => {
    expect(
      RightsRequestStateMachine.canTransition("SUBMITTED", "REJECTED"),
    ).toBe(true);
    expect(
      RightsRequestStateMachine.canTransition("ASSIGNED", "REJECTED"),
    ).toBe(true);
    expect(
      RightsRequestStateMachine.canTransition("IN_PROGRESS", "REJECTED"),
    ).toBe(true);
  });

  it("rejects illegal transitions", () => {
    expect(
      RightsRequestStateMachine.canTransition("SUBMITTED", "RESPONDED"),
    ).toBe(false);
    expect(
      RightsRequestStateMachine.canTransition("SUBMITTED", "CLOSED"),
    ).toBe(false);
    expect(
      RightsRequestStateMachine.canTransition("ASSIGNED", "CLOSED"),
    ).toBe(false);
    expect(
      RightsRequestStateMachine.canTransition("IN_PROGRESS", "CLOSED"),
    ).toBe(false);
    expect(
      RightsRequestStateMachine.canTransition("CLOSED", "REJECTED"),
    ).toBe(false);
    expect(
      RightsRequestStateMachine.canTransition("REJECTED", "ASSIGNED"),
    ).toBe(false);
  });

  it("treats CLOSED and REJECTED as terminal states", () => {
    expect(RightsRequestStateMachine.isTerminal("CLOSED")).toBe(true);
    expect(RightsRequestStateMachine.isTerminal("REJECTED")).toBe(true);
    expect(RightsRequestStateMachine.isTerminal("IN_PROGRESS")).toBe(false);
  });

  it("requires closing through RESPONDED (cannot close without resolution)", () => {
    // The service enforces resolutionSummary on CLOSED; the machine
    // additionally forbids closing from any non-RESPONDED state.
    expect(
      RightsRequestStateMachine.actionFor("RESPONDED", "CLOSED"),
    ).toBe("close");
    expect(
      RightsRequestStateMachine.actionFor("SUBMITTED", "CLOSED"),
    ).toBeNull();
  });

  it("throws on nextStatus for illegal transitions", () => {
    expect(() =>
      RightsRequestStateMachine.nextStatus("SUBMITTED", "CLOSED"),
    ).toThrow(/Illegal transition/);
  });

  it("defaults SLA to 30 days and provides a per-type override for grievances", () => {
    expect(DEFAULT_RIGHTS_REQUEST_SLA_DAYS).toBe(30);
    expect(RIGHTS_REQUEST_SLA_DAYS.ERASURE).toBe(30);
    expect(RIGHTS_REQUEST_SLA_DAYS.GRIEVANCE_REDRESSAL).toBe(45);
  });
});
