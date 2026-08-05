import { describe, expect, it } from "vitest";

import { ViolationLifecycleStateMachine } from "../domain/violation-lifecycle.state-machine.js";

describe("ViolationLifecycleStateMachine (VIO-004)", () => {
  it("accepts the full lifecycle OPEN → TRIAGE → ASSIGNED → IN_PROGRESS → PENDING_EVIDENCE → VALIDATED → CLOSED", () => {
    const path = [
      ["OPEN", "TRIAGE"],
      ["TRIAGE", "ASSIGNED"],
      ["ASSIGNED", "IN_PROGRESS"],
      ["IN_PROGRESS", "PENDING_EVIDENCE"],
      ["PENDING_EVIDENCE", "VALIDATED"],
      ["VALIDATED", "CLOSED"],
    ] as const;

    for (const [from, to] of path) {
      expect(
        ViolationLifecycleStateMachine.canTransition(from, to),
      ).toBe(true);
    }
  });

  it("allows direct assignment and direct start shortcuts", () => {
    expect(
      ViolationLifecycleStateMachine.canTransition("OPEN", "ASSIGNED"),
    ).toBe(true);
    expect(
      ViolationLifecycleStateMachine.canTransition("TRIAGE", "IN_PROGRESS"),
    ).toBe(true);
  });

  it("allows evidence return PENDING_EVIDENCE → IN_PROGRESS", () => {
    expect(
      ViolationLifecycleStateMachine.canTransition(
        "PENDING_EVIDENCE",
        "IN_PROGRESS",
      ),
    ).toBe(true);
  });

  it("allows archiving from any working state", () => {
    for (const from of [
      "OPEN",
      "TRIAGE",
      "ASSIGNED",
      "IN_PROGRESS",
      "PENDING_EVIDENCE",
      "VALIDATED",
    ] as const) {
      expect(
        ViolationLifecycleStateMachine.canTransition(from, "ARCHIVED"),
      ).toBe(true);
    }
  });

  it("requires closing through VALIDATED (cannot close from working states)", () => {
    expect(
      ViolationLifecycleStateMachine.canTransition("OPEN", "CLOSED"),
    ).toBe(false);
    expect(
      ViolationLifecycleStateMachine.canTransition("IN_PROGRESS", "CLOSED"),
    ).toBe(false);
    expect(
      ViolationLifecycleStateMachine.canTransition("PENDING_EVIDENCE", "CLOSED"),
    ).toBe(false);
    expect(
      ViolationLifecycleStateMachine.canTransition("VALIDATED", "CLOSED"),
    ).toBe(true);
  });

  it("treats CLOSED and ARCHIVED as terminal", () => {
    expect(ViolationLifecycleStateMachine.isTerminal("CLOSED")).toBe(true);
    expect(ViolationLifecycleStateMachine.isTerminal("ARCHIVED")).toBe(true);
    expect(ViolationLifecycleStateMachine.isTerminal("IN_PROGRESS")).toBe(
      false,
    );
  });

  it("rejects illegal transitions and reverse moves", () => {
    expect(
      ViolationLifecycleStateMachine.canTransition("CLOSED", "ARCHIVED"),
    ).toBe(false);
    expect(
      ViolationLifecycleStateMachine.canTransition("ASSIGNED", "OPEN"),
    ).toBe(false);
    expect(
      ViolationLifecycleStateMachine.canTransition("IN_PROGRESS", "TRIAGE"),
    ).toBe(false);
    expect(
      ViolationLifecycleStateMachine.canTransition("CLOSED", "OPEN"),
    ).toBe(false);
  });

  it("throws on nextStatus for illegal transitions", () => {
    expect(() =>
      ViolationLifecycleStateMachine.nextStatus("OPEN", "CLOSED"),
    ).toThrow(/Illegal transition/);
  });
});
