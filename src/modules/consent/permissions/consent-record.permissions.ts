import { PERMISSIONS } from "../../../shared/constants/permissions.js";

export const consentRecordPermissions = {
  read: PERMISSIONS.CONSENT_READ,
  create: PERMISSIONS.CONSENT_CREATE,
  withdraw: PERMISSIONS.CONSENT_WITHDRAW,
} as const;
