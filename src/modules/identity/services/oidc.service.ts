import { createHash, randomBytes, randomUUID } from "node:crypto";
import * as jose from "jose";
import { getRedis } from "../../../infrastructure/cache/redis-client.js";
import { appConfig } from "../../../config/app.config.js";
import {
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from "../../../shared/errors/app-error.js";
import { decryptSecret, encryptSecret } from "../../auth/utils/secret-crypto.js";
import { authService } from "../../auth/services/auth.service.js";
import type { UpsertIdentityProviderDto } from "../dto/identity.dto.js";
import { identityProviderRepository } from "../repositories/identity-provider.repository.js";
import { federatedUserService } from "./federated-user.service.js";

type OidcDiscovery = {
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  issuer: string;
};

function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

function amrIndicatesMfa(amr: unknown): boolean {
  if (!Array.isArray(amr)) return false;
  const values = amr.map((v) => String(v).toLowerCase());
  return values.some((v) => ["mfa", "otp", "sms", "hwk", "fido"].includes(v));
}

export class OidcService {
  async upsertProvider(organizationId: string, dto: UpsertIdentityProviderDto, providerId?: string) {
    if (dto.type !== "OIDC") {
      throw new ValidationError("Use the LDAP/SAML endpoints for non-OIDC providers");
    }
    if (!dto.issuer || !dto.clientId) {
      throw new ValidationError("OIDC provider requires issuer and clientId");
    }

    const secretEnc =
      dto.clientSecret !== undefined && dto.clientSecret !== null
        ? encryptSecret(dto.clientSecret)
        : undefined;

    if (providerId) {
      const existing = await identityProviderRepository.findById(organizationId, providerId);
      if (!existing || existing.type !== "OIDC") {
        throw new NotFoundError("OIDC provider not found");
      }
      return identityProviderRepository.update(providerId, {
        name: dto.name,
        enabled: dto.enabled ?? existing.enabled,
        issuer: dto.issuer,
        clientId: dto.clientId,
        ...(secretEnc ? { clientSecretEnc: secretEnc } : {}),
        tenantId: dto.tenantId ?? null,
        scopes: dto.scopes ?? "openid profile email User.Read GroupMember.Read.All",
      });
    }

    return identityProviderRepository.create({
      organization: { connect: { id: organizationId } },
      type: "OIDC",
      name: dto.name,
      enabled: dto.enabled ?? false,
      issuer: dto.issuer,
      clientId: dto.clientId,
      clientSecretEnc: secretEnc ?? null,
      tenantId: dto.tenantId ?? null,
      scopes: dto.scopes ?? "openid profile email User.Read GroupMember.Read.All",
    });
  }

  private async discovery(issuer: string): Promise<OidcDiscovery> {
    const base = issuer.replace(/\/$/, "");
    const url = `${base}/.well-known/openid-configuration`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new ValidationError(`OIDC discovery failed for ${issuer}`);
    }
    return (await res.json()) as OidcDiscovery;
  }

  async start(organizationId: string): Promise<{ authorizationUrl: string }> {
    const provider = await identityProviderRepository.findEnabledByType(organizationId, "OIDC");
    if (!provider || !provider.issuer || !provider.clientId) {
      throw new NotFoundError("No enabled OIDC / Entra provider for this organization");
    }

    const disco = await this.discovery(provider.issuer);
    const state = randomBytes(24).toString("base64url");
    const nonce = randomBytes(24).toString("base64url");
    const codeVerifier = randomBytes(32).toString("base64url");
    const codeChallenge = pkceChallenge(codeVerifier);

    const redis = getRedis();
    await redis.set(
      `auth:oidc:state:${state}`,
      JSON.stringify({
        organizationId,
        providerId: provider.id,
        nonce,
        codeVerifier,
      }),
      "EX",
      600,
    );

    const redirectUri = `${appConfig.apiPublicUrl}/api/v1/auth/oidc/callback`;
    const scopes =
      provider.scopes || "openid profile email User.Read GroupMember.Read.All";
    const url = new URL(disco.authorization_endpoint);
    url.searchParams.set("client_id", provider.clientId);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("scope", scopes);
    url.searchParams.set("state", state);
    url.searchParams.set("nonce", nonce);
    url.searchParams.set("code_challenge", codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");
    if (provider.tenantId) {
      url.searchParams.set("domain_hint", provider.tenantId);
    }

    return { authorizationUrl: url.toString() };
  }

  async handleCallback(input: {
    code?: string;
    state?: string;
    userAgent?: string;
    ipAddress?: string;
    correlationId?: string;
  }): Promise<{ redirectUrl: string }> {
    if (!input.code || !input.state) {
      throw new ValidationError("Missing OIDC code or state");
    }

    const redis = getRedis();
    const raw = await redis.get(`auth:oidc:state:${input.state}`);
    await redis.del(`auth:oidc:state:${input.state}`);
    if (!raw) {
      throw new UnauthorizedError("OIDC state expired or invalid");
    }

    const pending = JSON.parse(raw) as {
      organizationId: string;
      providerId: string;
      nonce: string;
      codeVerifier: string;
    };

    const provider = await identityProviderRepository.findById(
      pending.organizationId,
      pending.providerId,
    );
    if (!provider?.issuer || !provider.clientId || !provider.clientSecretEnc) {
      throw new NotFoundError("OIDC provider misconfigured");
    }

    const disco = await this.discovery(provider.issuer);
    const redirectUri = `${appConfig.apiPublicUrl}/api/v1/auth/oidc/callback`;
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code: input.code,
      redirect_uri: redirectUri,
      client_id: provider.clientId,
      client_secret: decryptSecret(provider.clientSecretEnc),
      code_verifier: pending.codeVerifier,
    });

    const tokenRes = await fetch(disco.token_endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!tokenRes.ok) {
      throw new UnauthorizedError("OIDC token exchange failed");
    }
    const tokenJson = (await tokenRes.json()) as {
      id_token?: string;
      access_token?: string;
    };
    if (!tokenJson.id_token) {
      throw new UnauthorizedError("OIDC response missing id_token");
    }

    const JWKS = jose.createRemoteJWKSet(new URL(disco.jwks_uri));
    const { payload } = await jose.jwtVerify(tokenJson.id_token, JWKS, {
      issuer: disco.issuer,
      audience: provider.clientId,
    });

    if (payload.nonce && payload.nonce !== pending.nonce) {
      throw new UnauthorizedError("OIDC nonce mismatch");
    }

    const subject = String(payload.oid ?? payload.sub ?? "");
    const email = String(
      payload.email ?? payload.preferred_username ?? payload.upn ?? "",
    );
    const name = String(payload.name ?? email);
    const upn = payload.preferred_username
      ? String(payload.preferred_username)
      : payload.upn
        ? String(payload.upn)
        : null;

    let groupIds: string[] = [];
    if (Array.isArray(payload.groups)) {
      groupIds = payload.groups.map(String);
    }

    if (tokenJson.access_token) {
      try {
        const { fetchGraphMemberGroups } = await import("./graph-sync.service.js");
        const fromGraph = await fetchGraphMemberGroups(
          tokenJson.access_token,
          "me/memberOf?$select=id,displayName",
        );
        groupIds = [...new Set([...groupIds, ...fromGraph])];
      } catch {
        // optional; group maps simply won't apply
      }
    }

    const mfaVerified =
      amrIndicatesMfa(payload.amr) ||
      String(payload.acr ?? "").toLowerCase().includes("mfa") ||
      // Entra Conditional Access often omits amr; treat interactive federated login as MFA-capable when org disables local TOTP
      false;

    const { userId } = await federatedUserService.upsertFromIdp({
      organizationId: pending.organizationId,
      providerId: provider.id,
      authSource: "OIDC",
      externalSubject: subject || email,
      externalIssuer: disco.issuer,
      email,
      name,
      upn,
      groupIds,
    });

    // If Conditional Access is used, org setting disableLocalTotpWhenFederated means we trust IdP MFA.
    const { identitySettingsService } = await import("./identity-settings.service.js");
    const settings = await identitySettingsService.getOrCreate(pending.organizationId);
    const trustIdpMfa = settings.disableLocalTotpWhenFederated || mfaVerified;

    const login = await authService.completeFederatedLogin(
      { organizationId: pending.organizationId, userId },
      {
        userAgent: input.userAgent,
        ipAddress: input.ipAddress,
        correlationId: input.correlationId,
      },
      { mfaVerified: trustIdpMfa },
    );

    const exchangeCode = randomBytes(32).toString("base64url");
    await redis.set(
      `auth:oidc:exchange:${exchangeCode}`,
      JSON.stringify(login),
      "EX",
      60,
    );

    const redirectUrl = `${appConfig.frontendPublicUrl}/login/sso?exchange=${encodeURIComponent(exchangeCode)}`;
    return { redirectUrl };
  }

  async exchange(exchangeCode: string) {
    const redis = getRedis();
    const key = `auth:oidc:exchange:${exchangeCode}`;
    const raw = await redis.get(key);
    await redis.del(key);
    if (!raw) {
      throw new UnauthorizedError("SSO exchange code expired or invalid");
    }
    return JSON.parse(raw) as Awaited<ReturnType<typeof authService.completeFederatedLogin>>;
  }
}

export const oidcService = new OidcService();
