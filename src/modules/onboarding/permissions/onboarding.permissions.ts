import { PERMISSIONS } from "../../../shared/constants/permissions.js";

export const onboardingPermissions = {
  /** Same gate as org update — admins / DPOs complete onboarding. */
  manage: PERMISSIONS.ORGANIZATION_UPDATE,
  read: PERMISSIONS.ORGANIZATION_READ,
} as const;
