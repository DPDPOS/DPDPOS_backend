import { describe, expect, it } from "vitest";
import {
  expandDirectoryGroupKeys,
  mapMatchesIncomingGroups,
} from "../domain/group-keys.js";

describe("directory group keys", () => {
  it("matches Entra object id and display name", () => {
    const keys = new Set(
      expandDirectoryGroupKeys(["aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", "DPDPOS-DPO"]),
    );
    expect(
      mapMatchesIncomingGroups(
        { externalGroupId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", externalGroupName: "DPDPOS-DPO" },
        keys,
      ),
    ).toBe(true);
    expect(
      mapMatchesIncomingGroups(
        { externalGroupId: "DPDPOS-DPO", externalGroupName: null },
        keys,
      ),
    ).toBe(true);
  });

  it("matches LDAP memberOf DN via CN", () => {
    const keys = new Set(
      expandDirectoryGroupKeys(["cn=DPDPOS-AUDITOR,dc=dpdpos,dc=local"]),
    );
    expect(
      mapMatchesIncomingGroups(
        { externalGroupId: "DPDPOS-AUDITOR", externalGroupName: "DPDPOS-AUDITOR" },
        keys,
      ),
    ).toBe(true);
  });
});
