import { PERMISSIONS } from "../../../shared/constants/permissions.js";

export const requirementPermissions = {
  create: PERMISSIONS.REQUIREMENT_CREATE,
  read: PERMISSIONS.REQUIREMENT_READ,
} as const;
