import { PERMISSIONS } from "../../../shared/constants/permissions.js";

export const noticePermissions = {
  read: PERMISSIONS.NOTICE_READ,
  create: PERMISSIONS.NOTICE_CREATE,
  delete: PERMISSIONS.NOTICE_DELETE,
} as const;
