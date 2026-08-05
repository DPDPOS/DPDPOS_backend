import { PERMISSIONS } from "../../../shared/constants/permissions.js";

export const dataAssetPermissions = {
  read: PERMISSIONS.DATA_ASSET_READ,
  create: PERMISSIONS.DATA_ASSET_CREATE,
  update: PERMISSIONS.DATA_ASSET_UPDATE,
  delete: PERMISSIONS.DATA_ASSET_DELETE,
} as const;
