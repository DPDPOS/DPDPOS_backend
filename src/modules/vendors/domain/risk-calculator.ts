import type { VendorRecord } from "../types/vendor.types.js";
import type { VendorRiskScorecard } from "../types/vendor.types.js";

const CRITICALITY_BASE: Record<string, number> = {
  LOW: 20,
  MEDIUM: 40,
  HIGH: 65,
  CRITICAL: 85,
};

/**
 * Deterministic inherent/residual scoring for TPRM scorecards.
 * Residual starts from inherent and is adjusted by DPA + latest review + SCRM children.
 */
export function computeVendorRisk(input: {
  vendor: VendorRecord;
  hasActiveDpa: boolean;
  dpaExpiresAt: Date | null;
  latestReviewOutcome: string | null;
  latestReviewResidual: string | null;
  childCriticalCount: number;
  /** Sub-processor edges that still need change acknowledgement */
  unacknowledgedChildCount?: number;
  /** Now override for deterministic tests */
  now?: Date;
}): VendorRiskScorecard {
  const now = input.now?.getTime() ?? Date.now();
  const factors: string[] = [];
  const openRiskFlags: string[] = [];

  let inherent = CRITICALITY_BASE[input.vendor.criticality] ?? 40;
  factors.push(`Base criticality ${input.vendor.criticality}=${inherent}`);

  if (input.vendor.dataCategories.length >= 3) {
    inherent = Math.min(100, inherent + 10);
    factors.push("Multiple data categories (+10)");
  }
  if (input.vendor.countries.some((c) => c.toUpperCase() !== "IN")) {
    inherent = Math.min(100, inherent + 10);
    factors.push("Cross-border / non-IN country (+10)");
    openRiskFlags.push("cross_border");
  }

  let residual = inherent;

  if (!input.hasActiveDpa) {
    residual = Math.min(100, residual + 15);
    factors.push("No active DPA (+15 residual)");
    openRiskFlags.push("missing_dpa");
  } else if (
    input.dpaExpiresAt &&
    input.dpaExpiresAt.getTime() < now + 30 * 24 * 60 * 60 * 1000
  ) {
    residual = Math.min(100, residual + 8);
    factors.push("DPA expiring within 30 days (+8)");
    openRiskFlags.push("dpa_expiring");
  } else {
    residual = Math.max(0, residual - 10);
    factors.push("Active DPA (-10)");
  }

  const outcome = input.latestReviewOutcome;
  if (outcome === "APPROVED") {
    residual = Math.max(0, residual - 10);
    factors.push("Latest review APPROVED (-10)");
  } else if (outcome === "CONDITIONAL") {
    residual = Math.min(100, residual + 5);
    factors.push("Latest review CONDITIONAL (+5)");
    openRiskFlags.push("conditional_review");
  } else if (outcome === "REJECTED") {
    residual = Math.min(100, residual + 20);
    factors.push("Latest review REJECTED (+20)");
    openRiskFlags.push("review_rejected");
  } else if (outcome === "PENDING" || !outcome) {
    residual = Math.min(100, residual + 8);
    factors.push(
      outcome === "PENDING"
        ? "Diligence review PENDING (+8)"
        : "No completed diligence review (+8)",
    );
    openRiskFlags.push("missing_review");
  }

  if (
    input.vendor.nextReviewAt &&
    input.vendor.nextReviewAt.getTime() < now
  ) {
    residual = Math.min(100, residual + 5);
    factors.push("Scheduled nextReviewAt is past due (+5)");
    openRiskFlags.push("review_overdue");
  }

  if (input.latestReviewResidual) {
    const reviewFloor = CRITICALITY_BASE[input.latestReviewResidual] ?? 0;
    if (reviewFloor > residual) {
      residual = reviewFloor;
      factors.push(
        `Review residual floor ${input.latestReviewResidual}=${reviewFloor}`,
      );
    }
  }

  if (input.childCriticalCount > 0) {
    const bump = Math.min(20, input.childCriticalCount * 5);
    residual = Math.min(100, residual + bump);
    factors.push(
      `SCRM: ${input.childCriticalCount} HIGH/CRITICAL child(ren) (+${bump})`,
    );
    openRiskFlags.push("supply_chain_concentration");
  }

  const unacked = input.unacknowledgedChildCount ?? 0;
  if (unacked > 0) {
    const bump = Math.min(15, unacked * 5);
    residual = Math.min(100, residual + bump);
    factors.push(
      `SCRM: ${unacked} unacknowledged sub-processor change(s) (+${bump})`,
    );
    openRiskFlags.push("unacknowledged_subprocessor");
  }

  return {
    vendorId: input.vendor.id,
    inherentRiskScore: inherent,
    residualRiskScore: residual,
    criticality: input.vendor.criticality,
    factors,
    hasActiveDpa: input.hasActiveDpa,
    dpaExpiresAt: input.dpaExpiresAt?.toISOString() ?? null,
    latestReviewOutcome: input.latestReviewOutcome,
    childCriticalCount: input.childCriticalCount,
    openRiskFlags,
  };
}
