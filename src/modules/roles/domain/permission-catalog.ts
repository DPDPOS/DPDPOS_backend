import { ALL_PERMISSIONS, type Permission } from "../../../shared/constants/permissions.js";
import { ValidationError } from "../../../shared/errors/app-error.js";

const PERMISSION_SET = new Set<string>(ALL_PERMISSIONS);

/**
 * Ensures every permission string exists in the frozen catalog.
 */
export function assertPermissionsInCatalog(permissions: string[]): Permission[] {
  const unknown = permissions.filter((p) => !PERMISSION_SET.has(p));
  if (unknown.length > 0) {
    throw new ValidationError("One or more permissions are not in the catalog", {
      unknownPermissions: unknown,
    });
  }
  // Deduplicate while preserving order
  return [...new Set(permissions)] as Permission[];
}
