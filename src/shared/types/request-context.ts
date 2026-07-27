export type RequestContext = {
  correlationId: string;
  organizationId: string;
  actorUserId: string;
  permissions: readonly string[];
  roles: readonly string[];
  mfaVerified?: boolean;
};

export type TenantScopedQuery = {
  organizationId: string;
  includeDeleted?: boolean;
};
