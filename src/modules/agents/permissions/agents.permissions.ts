import { PERMISSIONS } from "../../../shared/constants/permissions.js";

export const agentsPermissions = {
  read: PERMISSIONS.AGENT_READ,
  manage: PERMISSIONS.AGENT_MANAGE,
} as const;
