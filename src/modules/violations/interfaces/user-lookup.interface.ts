/**
 * Minimal user-lookup contract for tenant-scoped `assignedTo` validation.
 * Mirrors the rights module's UserLookup — swap the adapter for Dev A's
 * UsersService.getById() when it lands.
 */
export interface UserLookup {
  existsInOrganization(organizationId: string, userId: string): Promise<boolean>;
}
