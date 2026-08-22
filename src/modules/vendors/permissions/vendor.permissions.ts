import { PERMISSIONS } from "../../../shared/constants/permissions.js";

export const vendorPermissions = {
  read: PERMISSIONS.VENDOR_READ,
  create: PERMISSIONS.VENDOR_CREATE,
  update: PERMISSIONS.VENDOR_UPDATE,
  review: PERMISSIONS.VENDOR_REVIEW,
  offboard: PERMISSIONS.VENDOR_OFFBOARD,
} as const;
