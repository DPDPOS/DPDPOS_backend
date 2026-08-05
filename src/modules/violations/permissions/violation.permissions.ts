import { PERMISSIONS } from "../../../shared/constants/permissions.js";

export const violationPermissions = {
  read: PERMISSIONS.VIOLATION_READ,
  create: PERMISSIONS.VIOLATION_CREATE,
  assign: PERMISSIONS.VIOLATION_ASSIGN,
  close: PERMISSIONS.VIOLATION_CLOSE,
} as const;
