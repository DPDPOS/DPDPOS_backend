import { describe, expect, it } from "vitest";
import {
  identityModeSchema,
  upsertIdentityProviderDtoSchema,
} from "../dto/identity.dto.js";

describe("identity dto", () => {
  it("accepts supported modes", () => {
    expect(identityModeSchema.parse("LOCAL")).toBe("LOCAL");
    expect(identityModeSchema.parse("OIDC_ENTRA")).toBe("OIDC_ENTRA");
    expect(identityModeSchema.parse("LDAP_AD")).toBe("LDAP_AD");
  });

  it("accepts Entra MFA Authentication Context IDs and normalizes them", () => {
    const result = upsertIdentityProviderDtoSchema.parse({
      type: "OIDC",
      name: "Microsoft Entra",
      mfaAuthenticationContext: "C12",
    });
    expect(result.mfaAuthenticationContext).toBe("c12");
  });

  it("rejects invalid Entra MFA Authentication Context IDs", () => {
    expect(() =>
      upsertIdentityProviderDtoSchema.parse({
        type: "OIDC",
        name: "Microsoft Entra",
        mfaAuthenticationContext: "mfa",
      }),
    ).toThrow();
  });
});
