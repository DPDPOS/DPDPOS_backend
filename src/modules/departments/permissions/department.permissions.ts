import { PERMISSIONS } from "../../../shared/constants/permissions.js";

export const departmentPermissions = {
  create: PERMISSIONS.DEPARTMENT_CREATE,
  read: PERMISSIONS.DEPARTMENT_READ,
  update: PERMISSIONS.DEPARTMENT_UPDATE,
} as const;
