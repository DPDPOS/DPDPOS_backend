import { PERMISSIONS } from "../../../shared/constants/permissions.js";

export const processingActivityPermissions = {
  read: PERMISSIONS.PROCESSING_ACTIVITY_READ,
  create: PERMISSIONS.PROCESSING_ACTIVITY_CREATE,
  update: PERMISSIONS.PROCESSING_ACTIVITY_UPDATE,
  delete: PERMISSIONS.PROCESSING_ACTIVITY_DELETE,
} as const;
