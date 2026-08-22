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
    expect(score.residualRiskScore).toBeGreaterThan(score.inherentRiskScore);
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
});
