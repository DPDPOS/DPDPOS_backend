export type RequestContext = {
  correlationId: string;
  organizationId: string;
  actorUserId: string;
  permissions: readonly string[];
  roles: readonly string[];
  mfaVerified?: boolean;
  /** Client IP when the action originated from an HTTP request. */
  ipAddress?: string;
  /** User-Agent when the action originated from an HTTP request. */
  userAgent?: string;
};

export type TenantScopedQuery = {
  organizationId: string;
  includeDeleted?: boolean;
};
