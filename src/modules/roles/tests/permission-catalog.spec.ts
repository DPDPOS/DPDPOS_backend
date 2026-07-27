import { describe, expect, it } from "vitest";
import { assertPermissionsInCatalog } from "../domain/permission-catalog.js";
import { PERMISSIONS } from "../../../shared/constants/permissions.js";

describe("assertPermissionsInCatalog", () => {
  it("accepts known catalog permissions and deduplicates", () => {
    const result = assertPermissionsInCatalog([
      PERMISSIONS.ROLE_READ,
      PERMISSIONS.ROLE_CREATE,
      PERMISSIONS.ROLE_READ,
    ]);
    expect(result).toEqual([PERMISSIONS.ROLE_READ, PERMISSIONS.ROLE_CREATE]);
  });

  it("rejects unknown permission strings", () => {
    expect(() =>
      assertPermissionsInCatalog([PERMISSIONS.ROLE_READ, "not:a_real_permission"]),
    ).toThrowError(/catalog/i);
  });
});
