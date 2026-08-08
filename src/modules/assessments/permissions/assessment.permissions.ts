import { PERMISSIONS } from "../../../shared/constants/permissions.js";

export const assessmentPermissions = {
  create: PERMISSIONS.ASSESSMENT_CREATE,
  read: PERMISSIONS.ASSESSMENT_READ,
  update: PERMISSIONS.ASSESSMENT_UPDATE,
  evaluate: PERMISSIONS.ASSESSMENT_EVALUATE,
  cliToken: PERMISSIONS.ASSESSMENT_CLI_TOKEN,
} as const;
