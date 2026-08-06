import { PERMISSIONS } from "../../../shared/constants/permissions.js";

export const reportPermissions = {
  read: PERMISSIONS.REPORT_READ,
  generate: PERMISSIONS.REPORT_GENERATE,
} as const;
