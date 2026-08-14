import { z } from "zod";

export const identityModeSchema = z.enum([
  "LOCAL",
  "LDAP_AD",
  "OIDC_ENTRA",
  "SAML_ADFS",
  "HYBRID",
]);

export const updateIdentitySettingsDtoSchema = z.object({
  mode: identityModeSchema.optional(),
  enforceSso: z.boolean().optional(),
  allowLocalBreakGlass: z.boolean().optional(),
  disableLocalTotpWhenFederated: z.boolean().optional(),
  jitProvisioningEnabled: z.boolean().optional(),
  defaultRoleName: z.string().min(1).max(100).nullable().optional(),
});

export const identityProviderTypeSchema = z.enum(["LDAP", "OIDC", "SAML"]);

export const upsertIdentityProviderDtoSchema = z.object({
  type: identityProviderTypeSchema,
  name: z.string().min(1).max(120),
  enabled: z.boolean().optional(),
  issuer: z.string().url().optional().nullable(),
  clientId: z.string().min(1).max(200).optional().nullable(),
  clientSecret: z.string().min(1).max(500).optional().nullable(),
  tenantId: z.string().min(1).max(100).optional().nullable(),
  scopes: z.string().max(500).optional().nullable(),
  entityId: z.string().max(500).optional().nullable(),
  acsUrl: z.string().url().optional().nullable(),
  idpMetadataUrl: z.string().url().optional().nullable(),
  idpCertificate: z.string().max(20000).optional().nullable(),
  ldapHost: z.string().max(255).optional().nullable(),
  ldapPort: z.number().int().positive().max(65535).optional().nullable(),
  ldapUseTls: z.boolean().optional().nullable(),
  ldapBindDn: z.string().max(500).optional().nullable(),
  ldapBindPassword: z.string().max(500).optional().nullable(),
  ldapBaseDn: z.string().max(500).optional().nullable(),
  ldapUserFilter: z.string().max(500).optional().nullable(),
});

export const createGroupRoleMapDtoSchema = z.object({
  providerId: z.string().uuid(),
  externalGroupId: z.string().min(1).max(300),
  externalGroupName: z.string().max(300).optional().nullable(),
  roleId: z.string().uuid(),
});

export const ldapLoginDtoSchema = z.object({
  organizationId: z.string().uuid(),
  username: z.string().min(1).max(200),
  password: z.string().min(1).max(200),
});

export const oidcExchangeDtoSchema = z.object({
  exchangeCode: z.string().min(20).max(200),
});

export type UpdateIdentitySettingsDto = z.infer<typeof updateIdentitySettingsDtoSchema>;
export type UpsertIdentityProviderDto = z.infer<typeof upsertIdentityProviderDtoSchema>;
export type CreateGroupRoleMapDto = z.infer<typeof createGroupRoleMapDtoSchema>;
export type LdapLoginDto = z.infer<typeof ldapLoginDtoSchema>;
export type OidcExchangeDto = z.infer<typeof oidcExchangeDtoSchema>;
