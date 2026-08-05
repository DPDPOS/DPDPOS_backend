/**
 * Minimal user-lookup contract for tenant-scoped `assignedTo` validation.
 *
 * Per developer-b-getting-started.md §5: the rights module validates assignees
 * against Dev A's `users` via a stub contract until `UsersService.getById()`
 * lands — swap the concrete adapter behind this interface, nothing else changes.
 */
export interface UserLookup {
  /** Returns true when the user exists and belongs to the organization. */
  existsInOrganization(organizationId: string, userId: string): Promise<boolean>;
}
