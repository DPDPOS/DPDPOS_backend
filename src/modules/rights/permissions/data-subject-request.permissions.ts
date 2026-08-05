import { PERMISSIONS } from "../../../shared/constants/permissions.js";

export const dataSubjectRequestPermissions = {
  read: PERMISSIONS.RIGHTS_REQUEST_READ,
  create: PERMISSIONS.RIGHTS_REQUEST_CREATE,
  update: PERMISSIONS.RIGHTS_REQUEST_UPDATE,
} as const;
