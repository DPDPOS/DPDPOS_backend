import { describe, expect, it } from "vitest";
import { identityModeSchema } from "../dto/identity.dto.js";

describe("identity dto", () => {
  it("accepts supported modes", () => {
    expect(identityModeSchema.parse("LOCAL")).toBe("LOCAL");
    expect(identityModeSchema.parse("OIDC_ENTRA")).toBe("OIDC_ENTRA");
    expect(identityModeSchema.parse("LDAP_AD")).toBe("LDAP_AD");
  });
});
