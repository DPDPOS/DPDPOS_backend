import { PERMISSIONS } from "../../../shared/constants/permissions.js";

export const remediationTaskPermissions = {
  read: PERMISSIONS.REMEDIATION_READ,
  /** All mutations (create/assign/update/close) require update permission. */
  update: PERMISSIONS.REMEDIATION_UPDATE,
} as const;
