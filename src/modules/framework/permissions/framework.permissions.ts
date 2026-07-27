import { PERMISSIONS } from "../../../shared/constants/permissions.js";

export const frameworkPermissions = {
  generate: PERMISSIONS.FRAMEWORK_GENERATE,
  read: PERMISSIONS.FRAMEWORK_READ,
  publish: PERMISSIONS.FRAMEWORK_PUBLISH,
} as const;
