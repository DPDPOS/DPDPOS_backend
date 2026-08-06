import { PERMISSIONS } from "../../../shared/constants/permissions.js";

export const evidencePermissions = {
  create: 'evidence:create',
  read: 'evidence:read',
  approve: 'evidence:approve',
  export: 'evidence:export',
} as const;
