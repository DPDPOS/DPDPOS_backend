import { describe, expect, it } from "vitest";
import { computeVendorRisk } from "../domain/risk-calculator.js";
import type { VendorRecord } from "../types/vendor.types.js";

function baseVendor(over: Partial<VendorRecord> = {}): VendorRecord {
  return {
    id: "v1",
    organizationId: "o1",
    name: "Acme",
    legalName: null,
    vendorType: "PROCESSOR",
    countries: ["IN"],
    services: null,
    dataCategories: ["CONTACT"],
    criticality: "MEDIUM",
    status: "ACTIVE",
    inherentRiskScore: null,
    residualRiskScore: null,
    nextReviewAt: null,
    ownerUserId: null,
    notes: null,
    version: 1,
    createdBy: null,
    updatedBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...over,
  };
}

describe("computeVendorRisk", () => {
  it("flags missing DPA and raises residual risk", () => {
    const score = computeVendorRisk({
      vendor: baseVendor(),
      hasActiveDpa: false,
      dpaExpiresAt: null,
      latestReviewOutcome: null,
      latestReviewResidual: null,
      childCriticalCount: 0,
    });
    expect(score.openRiskFlags).toContain("missing_dpa");
    expect(score.openRiskFlags).toContain("missing_review");
    expect(score.residualRiskScore).toBeGreaterThan(score.inherentRiskScore);
  });

  it("treats PENDING review like an incomplete diligence", () => {
    const score = computeVendorRisk({
      vendor: baseVendor(),
      hasActiveDpa: true,
      dpaExpiresAt: new Date(Date.now() + 365 * 86400000),
      latestReviewOutcome: "PENDING",
      latestReviewResidual: null,
      childCriticalCount: 0,
    });
    expect(score.openRiskFlags).toContain("missing_review");
    expect(score.openRiskFlags).not.toContain("review_overdue");
  });

  it("flags review_overdue when nextReviewAt is past", () => {
    const now = new Date("2026-08-25T00:00:00Z");
    const score = computeVendorRisk({
      vendor: baseVendor({
        nextReviewAt: new Date("2026-01-01T00:00:00Z"),
      }),
      hasActiveDpa: true,
      dpaExpiresAt: new Date("2027-01-01T00:00:00Z"),
      latestReviewOutcome: "APPROVED",
      latestReviewResidual: "LOW",
      childCriticalCount: 0,
      now,
    });
    expect(score.openRiskFlags).toContain("review_overdue");
  });

  it("rolls up CRITICAL children into residual score", () => {
    const score = computeVendorRisk({
      vendor: baseVendor({ criticality: "HIGH" }),
      hasActiveDpa: true,
      dpaExpiresAt: new Date(Date.now() + 365 * 86400000),
      latestReviewOutcome: "APPROVED",
      latestReviewResidual: "MEDIUM",
      childCriticalCount: 2,
    });
    expect(score.openRiskFlags).toContain("supply_chain_concentration");
    expect(score.childCriticalCount).toBe(2);
  });

  it("flags unacknowledged sub-processor changes", () => {
    const score = computeVendorRisk({
      vendor: baseVendor(),
      hasActiveDpa: true,
      dpaExpiresAt: new Date(Date.now() + 365 * 86400000),
      latestReviewOutcome: "APPROVED",
      latestReviewResidual: "LOW",
      childCriticalCount: 0,
      unacknowledgedChildCount: 2,
    });
    expect(score.openRiskFlags).toContain("unacknowledged_subprocessor");
  });
});
