import type { ControlStatus, RequirementStatus } from "@prisma/client";

const CONTROL_TO_REQUIREMENT: Partial<
  Record<ControlStatus, RequirementStatus>
> = {
  NOT_STARTED: "NOT_STARTED",
  IN_PROGRESS: "IN_PROGRESS",
  IMPLEMENTED: "SATISFIED",
  VERIFIED: "VERIFIED",
};

export function deriveRequirementStatusFromControl(
  controlStatus: ControlStatus,
): RequirementStatus {
  return CONTROL_TO_REQUIREMENT[controlStatus] ?? "IN_PROGRESS";
}

export function computeRequirementStatus(input: {
  controlStatus?: ControlStatus | null;
  manualStatus?: RequirementStatus | null;
  hasApprovedEvidence: boolean;
}): RequirementStatus {
  if (input.manualStatus === "NOT_APPLICABLE") {
    return "NOT_APPLICABLE";
  }

  if (input.controlStatus) {
    const derived = deriveRequirementStatusFromControl(input.controlStatus);
    if (derived === "SATISFIED" && input.hasApprovedEvidence) {
      return "VERIFIED";
    }
    return derived;
  }

  if (input.manualStatus) {
    return input.manualStatus;
  }

  return input.hasApprovedEvidence ? "IN_PROGRESS" : "NOT_STARTED";
}
