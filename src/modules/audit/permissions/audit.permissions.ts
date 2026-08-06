import { PERMISSIONS } from "../../../shared/constants/permissions.js";

export const auditPermissions = {
  read: PERMISSIONS.AUDIT_READ,
  export: PERMISSIONS.AUDIT_EXPORT,
} as const;
