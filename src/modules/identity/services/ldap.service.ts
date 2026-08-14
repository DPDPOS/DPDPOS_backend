import { Client } from "ldapts";
import {
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from "../../../shared/errors/app-error.js";
import { decryptSecret, encryptSecret } from "../../auth/utils/secret-crypto.js";
import { authService } from "../../auth/services/auth.service.js";
import type { LdapLoginDto, UpsertIdentityProviderDto } from "../dto/identity.dto.js";
import { identityProviderRepository } from "../repositories/identity-provider.repository.js";
import { federatedUserService } from "./federated-user.service.js";

export class LdapService {
  async upsertProvider(organizationId: string, dto: UpsertIdentityProviderDto, providerId?: string) {
    if (dto.type !== "LDAP") {
      throw new ValidationError("Provider type must be LDAP");
    }
    if (!dto.ldapHost || !dto.ldapBaseDn || !dto.ldapUserFilter) {
      throw new ValidationError("LDAP requires host, base DN, and user filter");
    }

    const bindDnEnc =
      dto.ldapBindDn !== undefined && dto.ldapBindDn !== null
        ? encryptSecret(dto.ldapBindDn)
        : undefined;
    const bindPwEnc =
      dto.ldapBindPassword !== undefined && dto.ldapBindPassword !== null
        ? encryptSecret(dto.ldapBindPassword)
        : undefined;

    if (providerId) {
      const existing = await identityProviderRepository.findById(organizationId, providerId);
      if (!existing || existing.type !== "LDAP") {
        throw new NotFoundError("LDAP provider not found");
      }
      return identityProviderRepository.update(providerId, {
        name: dto.name,
        enabled: dto.enabled ?? existing.enabled,
        ldapHost: dto.ldapHost,
        ldapPort: dto.ldapPort ?? 636,
        ldapUseTls: dto.ldapUseTls ?? true,
        ...(bindDnEnc ? { ldapBindDnEnc: bindDnEnc } : {}),
        ...(bindPwEnc ? { ldapBindPasswordEnc: bindPwEnc } : {}),
        ldapBaseDn: dto.ldapBaseDn,
        ldapUserFilter: dto.ldapUserFilter,
      });
    }

    return identityProviderRepository.create({
      organization: { connect: { id: organizationId } },
      type: "LDAP",
      name: dto.name,
      enabled: dto.enabled ?? false,
      ldapHost: dto.ldapHost,
      ldapPort: dto.ldapPort ?? 636,
      ldapUseTls: dto.ldapUseTls ?? true,
      ldapBindDnEnc: bindDnEnc ?? null,
      ldapBindPasswordEnc: bindPwEnc ?? null,
      ldapBaseDn: dto.ldapBaseDn,
      ldapUserFilter: dto.ldapUserFilter,
    });
  }

  async login(
    dto: LdapLoginDto,
    meta: { userAgent?: string; ipAddress?: string; correlationId?: string } = {},
  ) {
    const provider = await identityProviderRepository.findEnabledByType(
      dto.organizationId,
      "LDAP",
    );
    if (!provider?.ldapHost || !provider.ldapBaseDn || !provider.ldapUserFilter) {
      throw new NotFoundError("No enabled Windows AD / LDAP provider for this organization");
    }

    const url = `${provider.ldapUseTls === false ? "ldap" : "ldaps"}://${provider.ldapHost}:${provider.ldapPort ?? 636}`;
    const client = new Client({ url, timeout: 10_000, connectTimeout: 10_000 });

    try {
      if (provider.ldapBindDnEnc && provider.ldapBindPasswordEnc) {
        await client.bind(
          decryptSecret(provider.ldapBindDnEnc),
          decryptSecret(provider.ldapBindPasswordEnc),
        );
      }

      const filter = provider.ldapUserFilter.replaceAll(
        "{username}",
        dto.username.replace(/[\\*()]/g, ""),
      );
      const { searchEntries } = await client.search(provider.ldapBaseDn, {
        scope: "sub",
        filter,
        attributes: [
          "dn",
          "mail",
          "userPrincipalName",
          "displayName",
          "cn",
          "objectGUID",
          "memberOf",
          "sAMAccountName",
        ],
        sizeLimit: 1,
      });

      const entry = searchEntries[0];
      if (!entry?.dn) {
        throw new UnauthorizedError("Invalid username or password");
      }

      // Re-bind as the user to verify password
      await client.unbind().catch(() => undefined);
      const userClient = new Client({ url, timeout: 10_000, connectTimeout: 10_000 });
      try {
        await userClient.bind(String(entry.dn), dto.password);
      } catch {
        throw new UnauthorizedError("Invalid username or password");
      } finally {
        await userClient.unbind().catch(() => undefined);
      }

      const email = String(
        entry.mail || entry.userPrincipalName || `${dto.username}@ad.local`,
      ).toLowerCase();
      const name = String(entry.displayName || entry.cn || dto.username);
      const upn = entry.userPrincipalName ? String(entry.userPrincipalName) : null;
      const subject = entry.objectGUID
        ? Buffer.isBuffer(entry.objectGUID)
          ? entry.objectGUID.toString("hex")
          : String(entry.objectGUID)
        : String(entry.dn);

      const memberOf = entry.memberOf;
      const groupIds = Array.isArray(memberOf)
        ? memberOf.map(String)
        : memberOf
          ? [String(memberOf)]
          : [];

      const { userId } = await federatedUserService.upsertFromIdp({
        organizationId: dto.organizationId,
        providerId: provider.id,
        authSource: "LDAP",
        externalSubject: subject,
        externalIssuer: `ldap://${provider.ldapHost}`,
        email,
        name,
        upn,
        groupIds,
      });

      // LDAP bind alone is not MFA
      return authService.completeFederatedLogin(
        { organizationId: dto.organizationId, userId },
        meta,
        { mfaVerified: false },
      );
    } finally {
      await client.unbind().catch(() => undefined);
    }
  }
}

export const ldapService = new LdapService();
