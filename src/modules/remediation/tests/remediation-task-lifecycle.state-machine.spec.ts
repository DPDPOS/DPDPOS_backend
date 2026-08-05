import { describe, expect, it } from "vitest";

import { RemediationTaskLifecycleStateMachine } from "../domain/remediation-task-lifecycle.state-machine.js";

describe("RemediationTaskLifecycleStateMachine (REM-005)", () => {
  it("accepts the full lifecycle PENDING → IN_PROGRESS → PENDING_VERIFICATION → VERIFIED → CLOSED", () => {
    const path = [
      ["PENDING", "IN_PROGRESS"],
      ["IN_PROGRESS", "PENDING_VERIFICATION"],
      ["PENDING_VERIFICATION", "VERIFIED"],
      ["VERIFIED", "CLOSED"],
    ] as const;

    for (const [from, to] of path) {
      expect(
        RemediationTaskLifecycleStateMachine.canTransition(from, to),
      ).toBe(true);
    }
  });

  it("allows rework from PENDING_VERIFICATION back to IN_PROGRESS", () => {
    expect(
      RemediationTaskLifecycleStateMachine.canTransition(
        "PENDING_VERIFICATION",
        "IN_PROGRESS",
      ),
    ).toBe(true);
  });

  it("allows cancelling from any working state", () => {
    for (const from of [
      "PENDING",
      "IN_PROGRESS",
      "PENDING_VERIFICATION",
      "VERIFIED",
    ] as const) {
      expect(
        RemediationTaskLifecycleStateMachine.canTransition(from, "CANCELLED"),
      ).toBe(true);
    }
  });

  it("requires closing through VERIFIED (cannot close from working states)", () => {
    expect(
      RemediationTaskLifecycleStateMachine.canTransition("PENDING", "CLOSED"),
    ).toBe(false);
    expect(
      RemediationTaskLifecycleStateMachine.canTransition(
        "IN_PROGRESS",
        "CLOSED",
      ),
    ).toBe(false);
    expect(
      RemediationTaskLifecycleStateMachine.canTransition(
        "PENDING_VERIFICATION",
        "CLOSED",
      ),
    ).toBe(false);
    expect(
      RemediationTaskLifecycleStateMachine.canTransition("VERIFIED", "CLOSED"),
    ).toBe(true);
  });

  it("treats CLOSED and CANCELLED as terminal", () => {
    expect(RemediationTaskLifecycleStateMachine.isTerminal("CLOSED")).toBe(
      true,
    );
    expect(RemediationTaskLifecycleStateMachine.isTerminal("CANCELLED")).toBe(
      true,
    );
    expect(RemediationTaskLifecycleStateMachine.isTerminal("IN_PROGRESS")).toBe(
      false,
    );
  });

  it("rejects illegal transitions and reverse moves", () => {
    expect(
      RemediationTaskLifecycleStateMachine.canTransition("CLOSED", "CANCELLED"),
    ).toBe(false);
    expect(
      RemediationTaskLifecycleStateMachine.canTransition("VERIFIED", "PENDING"),
    ).toBe(false);
    expect(
      RemediationTaskLifecycleStateMachine.canTransition(
        "IN_PROGRESS",
        "PENDING",
      ),
    ).toBe(false);
    expect(
      RemediationTaskLifecycleStateMachine.canTransition("CLOSED", "PENDING"),
    ).toBe(false);
  });

  it("reports the action name for a transition", () => {
    expect(
      RemediationTaskLifecycleStateMachine.actionFor(
        "PENDING_VERIFICATION",
        "VERIFIED",
      ),
    ).toBe("verify");
    expect(
      RemediationTaskLifecycleStateMachine.actionFor("PENDING", "CLOSED"),
    ).toBeNull();
  });

  it("throws on nextStatus for illegal transitions", () => {
    expect(() =>
      RemediationTaskLifecycleStateMachine.nextStatus("PENDING", "CLOSED"),
    ).toThrow(/Illegal transition/);
  });
});
