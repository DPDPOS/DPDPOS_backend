import { PERMISSIONS } from "../../../shared/constants/permissions.js";

export const identityPermissions = {
  read: PERMISSIONS.IDENTITY_READ,
  update: PERMISSIONS.IDENTITY_UPDATE,
  sync: PERMISSIONS.IDENTITY_SYNC,
} as const;
