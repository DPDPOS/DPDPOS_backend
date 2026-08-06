/**
 * Read-only, tenant-scoped violation lookup used to validate that a
 * remediation task links to a violation in the caller's organization.
 *
 * Deliberately a local adapter rather than an import into the violations
 * module (which is read-only for remediation). Swap for the violations
 * module's exported read service when one is exposed.
 */
export interface ViolationLookup {
  findById(
    organizationId: string,
    violationId: string,
  ): Promise<{ id: string } | null>;
}
