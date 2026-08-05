import { describe, expect, it } from "vitest";
import { assertTransition, canTransition } from "../domain/evidence-lifecycle.js";

describe("evidence lifecycle", () => {
  it("allows the approval workflow", () => {
    expect(canTransition("UPLOADED", "TAGGED")).toBe(true);
    expect(canTransition("UNDER_REVIEW", "APPROVED")).toBe(true);
    expect(canTransition("APPROVED", "LOCKED")).toBe(true);
  });

  it("rejects skipping review or changing locked evidence", () => {
    expect(() => assertTransition("UPLOADED", "APPROVED")).toThrow();
    expect(() => assertTransition("LOCKED", "TAGGED")).toThrow();
  });
});
