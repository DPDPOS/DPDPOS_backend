import { PERMISSIONS } from "../../../shared/constants/permissions.js";

export const controlPermissions = {
  create: PERMISSIONS.CONTROL_CREATE,
  read: PERMISSIONS.CONTROL_READ,
  update: PERMISSIONS.CONTROL_UPDATE,
} as const;
