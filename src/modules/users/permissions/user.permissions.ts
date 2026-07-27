import { PERMISSIONS } from "../../../shared/constants/permissions.js";

export const userPermissions = {
  create: PERMISSIONS.USER_CREATE,
  read: PERMISSIONS.USER_READ,
  update: PERMISSIONS.USER_UPDATE,
  invite: PERMISSIONS.USER_INVITE,
} as const;
