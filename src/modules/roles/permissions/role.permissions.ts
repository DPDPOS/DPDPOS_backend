import { PERMISSIONS } from "../../../shared/constants/permissions.js";

export const rolePermissions = {
  create: PERMISSIONS.ROLE_CREATE,
  read: PERMISSIONS.ROLE_READ,
  updatePermissions: PERMISSIONS.ROLE_UPDATE_PERMISSIONS,
  assign: PERMISSIONS.ROLE_ASSIGN,
} as const;
