import { PERMISSIONS } from "../../../shared/constants/permissions.js";

export const validationPermissions = {
  read: PERMISSIONS.VALIDATION_READ,
  run: PERMISSIONS.VALIDATION_RUN,
} as const;
