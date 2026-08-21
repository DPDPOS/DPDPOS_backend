import { NotFoundError, ValidationError } from "../../../shared/errors/app-error.js";
import { prisma } from "../../../infrastructure/database/prisma-client.js";
import type {
  CreateGroupRoleMapDto,
  UpsertIdentityProviderDto,
} from "../dto/identity.dto.js";
import { identityProviderRepository } from "../repositories/identity-provider.repository.js";
import { identityGroupMapRepository } from "../repositories/identity-group-map.repository.js";
import { oidcService } from "./oidc.service.js";
import { ldapService } from "./ldap.service.js";

function sanitizeProvider(row: {
  id: string;
  organizationId: string;
  type: string;
  name: string;
  enabled: boolean;
  issuer: string | null;
  clientId: string | null;
  clientSecretEnc: string | null;
  tenantId: string | null;
  scopes: string | null;
  mfaAuthenticationContext: string | null;
  entityId: string | null;
  acsUrl: string | null;
  idpMetadataUrl: string | null;
  ldapHost: string | null;
  ldapPort: number | null;
  ldapUseTls: boolean | null;
  ldapBaseDn: string | null;
  ldapUserFilter: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    type: row.type,
    name: row.name,
    enabled: row.enabled,
    issuer: row.issuer,
    clientId: row.clientId,
    hasClientSecret: Boolean(row.clientSecretEnc),
    tenantId: row.tenantId,
    scopes: row.scopes,
    mfaAuthenticationContext: row.mfaAuthenticationContext,
    entityId: row.entityId,
    acsUrl: row.acsUrl,
    idpMetadataUrl: row.idpMetadataUrl,
    ldapHost: row.ldapHost,
    ldapPort: row.ldapPort,
    ldapUseTls: row.ldapUseTls,
    ldapBaseDn: row.ldapBaseDn,
    ldapUserFilter: row.ldapUserFilter,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class IdentityAdminService {
  async listProviders(organizationId: string) {
    const rows = await identityProviderRepository.list(organizationId);
    return rows.map(sanitizeProvider);
  }

  async upsertProvider(
    organizationId: string,
    dto: UpsertIdentityProviderDto,
    providerId?: string,
  ) {
    if (dto.type === "OIDC") {
      const row = await oidcService.upsertProvider(organizationId, dto, providerId);
      return sanitizeProvider(row);
    }
    if (dto.type === "LDAP") {
      const row = await ldapService.upsertProvider(organizationId, dto, providerId);
      return sanitizeProvider(row);
    }
    // SAML: store metadata now; assertion consumer implemented as stub that returns clear error until metadata parsed
    if (!dto.entityId || !dto.acsUrl) {
      throw new ValidationError("SAML provider requires entityId and acsUrl");
    }
    if (providerId) {
      const existing = await identityProviderRepository.findById(organizationId, providerId);
      if (!existing || existing.type !== "SAML") {
        throw new NotFoundError("SAML provider not found");
      }
      const row = await identityProviderRepository.update(providerId, {
        name: dto.name,
        enabled: dto.enabled ?? existing.enabled,
        entityId: dto.entityId,
        acsUrl: dto.acsUrl,
        idpMetadataUrl: dto.idpMetadataUrl ?? null,
        idpCertificate: dto.idpCertificate ?? null,
      });
      return sanitizeProvider(row);
    }
    const row = await identityProviderRepository.create({
      organization: { connect: { id: organizationId } },
      type: "SAML",
      name: dto.name,
      enabled: dto.enabled ?? false,
      entityId: dto.entityId,
      acsUrl: dto.acsUrl,
      idpMetadataUrl: dto.idpMetadataUrl ?? null,
      idpCertificate: dto.idpCertificate ?? null,
    });
    return sanitizeProvider(row);
  }

  async deleteProvider(organizationId: string, providerId: string) {
    const existing = await identityProviderRepository.findById(organizationId, providerId);
    if (!existing) throw new NotFoundError("Provider not found");
    await identityProviderRepository.softDelete(providerId);
    return { deleted: true };
  }

  listGroupMaps(organizationId: string, providerId?: string) {
    return identityGroupMapRepository.list(organizationId, providerId);
  }

  async createGroupMap(organizationId: string, dto: CreateGroupRoleMapDto) {
    const provider = await identityProviderRepository.findById(
      organizationId,
      dto.providerId,
    );
    if (!provider) throw new NotFoundError("Provider not found");
    const role = await prisma.role.findFirst({
      where: { id: dto.roleId, organizationId, deletedAt: null },
    });
    if (!role) throw new NotFoundError("Role not found");
    return identityGroupMapRepository.create({
      organizationId,
      providerId: dto.providerId,
      externalGroupId: dto.externalGroupId,
      externalGroupName: dto.externalGroupName,
      roleId: dto.roleId,
    });
  }

  async deleteGroupMap(organizationId: string, mapId: string) {
    const result = await identityGroupMapRepository.delete(organizationId, mapId);
    if (result.count === 0) throw new NotFoundError("Group map not found");
    return { deleted: true };
  }

  async syncDirectory(organizationId: string) {
    const { graphSyncService } = await import("./graph-sync.service.js");
    return graphSyncService.syncOrganization(organizationId);
  }

  async enableEntraGroupScopes(organizationId: string) {
    const provider = await identityProviderRepository.findEnabledByType(organizationId, "OIDC");
    if (!provider) throw new NotFoundError("No enabled Entra OIDC provider");
    const scopes = "openid profile email User.Read GroupMember.Read.All";
    const row = await identityProviderRepository.update(provider.id, { scopes });
    return sanitizeProvider(row);
  }
}

export const identityAdminService = new IdentityAdminService();
