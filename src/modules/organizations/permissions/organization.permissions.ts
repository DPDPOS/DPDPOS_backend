import { PERMISSIONS } from "../../../shared/constants/permissions.js";

export const organizationPermissions = {
  create: PERMISSIONS.ORGANIZATION_CREATE,
  read: PERMISSIONS.ORGANIZATION_READ,
  update: PERMISSIONS.ORGANIZATION_UPDATE,
} as const;
