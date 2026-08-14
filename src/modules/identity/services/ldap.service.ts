import { Client } from "ldapts";
import {
  NotFoundError,
  ServiceUnavailableError,
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
    const ldapHost = dto.ldapHost
      .replace(/^ldaps?:\/\//i, "")
      .replace(/^https?:\/\//i, "")
      .split("/")[0]
      ?.split(":")[0];
    if (!ldapHost) {
      throw new ValidationError("LDAP host must be a hostname like localhost, not a URL");
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
      const useTls = dto.ldapUseTls ?? existing.ldapUseTls ?? false;
      return identityProviderRepository.update(providerId, {
        name: dto.name,
        enabled: dto.enabled ?? existing.enabled,
        ldapHost,
        ldapPort: dto.ldapPort ?? existing.ldapPort ?? (useTls ? 636 : 389),
        ldapUseTls: useTls,
        ...(bindDnEnc ? { ldapBindDnEnc: bindDnEnc } : {}),
        ...(bindPwEnc ? { ldapBindPasswordEnc: bindPwEnc } : {}),
        ldapBaseDn: dto.ldapBaseDn,
        ldapUserFilter: dto.ldapUserFilter,
      });
    }

    const useTls = dto.ldapUseTls ?? false;
    return identityProviderRepository.create({
      organization: { connect: { id: organizationId } },
      type: "LDAP",
      name: dto.name,
      enabled: dto.enabled ?? false,
      ldapHost,
      ldapPort: dto.ldapPort ?? (useTls ? 636 : 389),
      ldapUseTls: useTls,
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

    const scheme = provider.ldapUseTls === false ? "ldap" : "ldaps";
    const port = provider.ldapPort ?? (scheme === "ldaps" ? 636 : 389);
    const url = `${scheme}://${provider.ldapHost}:${port}`;
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
    } catch (err) {
      if (
        err instanceof UnauthorizedError ||
        err instanceof NotFoundError ||
        err instanceof ValidationError ||
        err instanceof ServiceUnavailableError
      ) {
        throw err;
      }
      const code = (err as { code?: string }).code;
      if (code === "ECONNREFUSED" || code === "ETIMEDOUT" || err instanceof AggregateError) {
        throw new ServiceUnavailableError(
          `Cannot reach LDAP at ${url}. For local OpenLDAP use host "localhost", port 389, and leave LDAPS unchecked.`,
        );
      }
      throw err;
    } finally {
      await client.unbind().catch(() => undefined);
    }
  }
}

export const ldapService = new LdapService();
