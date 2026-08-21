import argon2 from "argon2";
import { randomInt, timingSafeEqual } from "node:crypto";
import type { Prisma } from "@prisma/client";
import {
  UnauthorizedError,
  ValidationError,
} from "../../../shared/errors/app-error.js";
import { appConfig } from "../../../config/app.config.js";
import { getRedis } from "../../../infrastructure/cache/redis-client.js";
import { sendEmailOtp } from "../../../infrastructure/email/email-otp.sender.js";
import { emailOtpQueue } from "../../../jobs/queues/email-otp.queue.js";
import { withTransaction } from "../../../infrastructure/database/transaction-manager.js";
import { prisma } from "../../../infrastructure/database/prisma-client.js";
import { writeOutboxEvent } from "../../../events/outbox/outbox.repository.js";
import { DOMAIN_EVENTS } from "../../../events/types/base-event.interface.js";
import {
  setCachedPermissions,
  invalidateUserPermissions,
} from "../../../infrastructure/cache/permission-cache.js";
import type { RequestContext } from "../../../shared/types/request-context.js";
import type {
  AcceptInviteDto,
  LoginDto,
  LogoutDto,
  MfaConfirmDto,
  MfaVerifyDto,
  RefreshDto,
} from "../dto/auth.dto.js";
import { AuthRepository, type AuthUserRecord } from "../repositories/auth.repository.js";
import {
  decodeAccessTokenUnsafe,
  signAccessToken,
} from "../utils/jwt.js";
import {
  generateAccessTokenJti,
  generateRefreshToken,
  hashToken,
} from "../utils/token-crypto.js";
import { denyAccessTokenJti } from "../utils/token-denylist.js";
import {
  buildOtpAuthUrl,
  generateTotpSecret,
  isPrivilegedRoleSet,
  verifyTotpCode,
} from "../utils/mfa.js";
import {
  signMfaChallengeToken,
  verifyMfaChallengeToken,
} from "../utils/mfa-challenge-token.js";
import { decryptSecret, encryptSecret } from "../utils/secret-crypto.js";

export type AuthTokens = {
  accessToken: string;
  refreshToken: string;
  tokenType: "Bearer";
  expiresIn: number;
};

export type AuthMeResponse = {
  id: string;
  organizationId: string;
  email: string;
  name: string;
  status: string;
  roles: string[];
  permissions: string[];
  mfaEnabled: boolean;
  mfaEnrollmentRequired: boolean;
};

export type LoginSuccessResult = {
  mfaRequired: false;
  user: AuthMeResponse;
  tokens: AuthTokens;
  mfaEnrollmentRequired: boolean;
};

export type LoginMfaChallengeResult = {
  mfaRequired: true;
  mfaToken: string;
  expiresIn: number;
};

export type LoginResult = LoginSuccessResult | LoginMfaChallengeResult;

export class AuthService {
  constructor(private readonly repo = new AuthRepository()) {}

  async login(
    input: LoginDto,
    meta: { userAgent?: string; ipAddress?: string; correlationId?: string } = {},
  ): Promise<LoginResult> {
    const settings = await this.safeIdentitySettings(input.organizationId);
    if (settings.enforceSso && !settings.allowLocalBreakGlass) {
      throw new UnauthorizedError(
        "Password login is disabled for this organization. Use directory SSO.",
      );
    }

    const user = await this.repo.findUserForLogin({
      organizationId: input.organizationId,
      email: input.email.trim().toLowerCase(),
    });

    if (!user || !user.passwordHash) {
      throw new UnauthorizedError("Invalid email or password");
    }
    if (user.status === "DISABLED") {
      throw new UnauthorizedError("Account is disabled");
    }
    if (settings.enforceSso && user.authSource !== "LOCAL") {
      throw new UnauthorizedError(
        "This account must sign in with directory SSO.",
      );
    }

    const passwordOk = await argon2.verify(user.passwordHash, input.password);
    if (!passwordOk) {
      throw new UnauthorizedError("Invalid email or password");
    }

    return this.createEmailOtpChallenge(user);
  }

  async verifyMfa(
    input: MfaVerifyDto,
    meta: { userAgent?: string; ipAddress?: string; correlationId?: string } = {},
  ): Promise<LoginSuccessResult> {
    const claims = verifyMfaChallengeToken(input.mfaToken);
    const user = await this.repo.findUserById({
      organizationId: claims.organizationId,
      userId: claims.sub,
    });
    if (!user) {
      throw new UnauthorizedError("Invalid MFA challenge");
    }

    if (claims.factor === "EMAIL_OTP") {
      const key = `auth:email-otp:${hashToken(input.mfaToken)}`;
      const stored = await getRedis().call("GETDEL", key);
      if (typeof stored !== "string" || !this.codesMatch(stored, input.code)) {
        throw new UnauthorizedError("Invalid or expired MFA code");
      }
    } else {
      if (!user.mfaEnabled || !user.mfaSecretEnc) {
        throw new UnauthorizedError("MFA is not enabled for this account");
      }
      const secret = decryptSecret(user.mfaSecretEnc);
      if (!verifyTotpCode(secret, input.code)) {
        throw new UnauthorizedError("Invalid MFA code");
      }
    }

    const tokens = await this.issueSession(user, meta, {
      emitLoginEvent: true,
      activateIfInvited: user.status === "INVITED",
      correlationId: meta.correlationId,
      mfaVerified: true,
    });

    return {
      mfaRequired: false,
      user: this.toMe(
        { ...user, status: user.status === "INVITED" ? "ACTIVE" : user.status },
        false,
      ),
      tokens,
      mfaEnrollmentRequired: false,
    };
  }

  async setupMfa(ctx: RequestContext): Promise<{
    secret: string;
    otpauthUrl: string;
  }> {
    const user = await this.requireActiveUser(ctx);
    if (!isPrivilegedRoleSet(user.roleNames)) {
      throw new ValidationError(
        "MFA enrollment is only required for ORG_ADMIN, DPO, and AUDITOR roles",
      );
    }

    const secret = generateTotpSecret();
    await this.repo.saveMfaPendingSecret(prisma, user.id, encryptSecret(secret));

    return {
      secret,
      otpauthUrl: buildOtpAuthUrl({ email: user.email, secret }),
    };
  }

  async confirmMfa(
    ctx: RequestContext,
    input: MfaConfirmDto,
  ): Promise<{ mfaEnabled: true }> {
    const user = await this.requireActiveUser(ctx);
    if (!user.mfaSecretEnc) {
      throw new ValidationError("Call MFA setup before confirming");
    }

    const secret = decryptSecret(user.mfaSecretEnc);
    if (!verifyTotpCode(secret, input.code)) {
      throw new UnauthorizedError("Invalid MFA code");
    }

    await withTransaction(async (tx) => {
      await this.repo.enableMfa(tx, user.id);
    });

    return { mfaEnabled: true };
  }

  async acceptInvite(
    input: AcceptInviteDto,
  ): Promise<{ userId: string; status: "ACTIVE" }> {
    const email = input.email.trim().toLowerCase();
    const row = await this.repo.findUserForInviteAccept({
      organizationId: input.organizationId,
      email,
    });
    if (!row || !row.inviteTokenHash || !row.inviteExpiresAt) {
      throw new UnauthorizedError("Invalid or expired invite");
    }
    if (row.inviteExpiresAt.getTime() < Date.now()) {
      throw new UnauthorizedError("Invalid or expired invite");
    }

    const tokenHash = hashToken(input.inviteToken);
    if (tokenHash !== row.inviteTokenHash) {
      throw new UnauthorizedError("Invalid or expired invite");
    }

    const passwordHash = await argon2.hash(input.password);
    await withTransaction(async (tx) => {
      await this.repo.acceptInvite(tx, row.id, passwordHash);
    });

    await invalidateUserPermissions(row.organizationId, row.id);

    return { userId: row.id, status: "ACTIVE" };
  }

  async refresh(
    input: RefreshDto,
    meta: { userAgent?: string; ipAddress?: string; correlationId?: string } = {},
  ): Promise<AuthTokens> {
    const tokenHash = hashToken(input.refreshToken);
    const session = await this.repo.findActiveRefreshSession(tokenHash);
    if (!session) {
      throw new UnauthorizedError("Invalid or expired refresh token");
    }

    const user = await this.repo.findUserById({
      organizationId: session.organizationId,
      userId: session.userId,
    });
    if (!user || user.status === "DISABLED") {
      throw new UnauthorizedError("Invalid or expired refresh token");
    }

    const privileged = isPrivilegedRoleSet(user.roleNames);
    if (privileged && user.mfaEnabled) {
      // Refresh preserves prior MFA session only via re-login challenge;
      // require mfaVerified=false unless we stored it on refresh session.
      // Keep refresh usable but mark mfaVerified false; privileged routes use requireMfa.
    }

    return withTransaction(async (tx) => {
      await this.repo.revokeRefreshSession(tx, session.id);
      return this.issueSessionInTx(tx, user, meta, {
        emitLoginEvent: false,
        activateIfInvited: false,
        correlationId: meta.correlationId,
        mfaVerified: false,
      });
    });
  }

  async logout(
    input: LogoutDto,
    accessToken?: string,
  ): Promise<{ success: true }> {
    const tokenHash = hashToken(input.refreshToken);
    const revoked = await withTransaction(async (tx) =>
      this.repo.revokeRefreshSessionByHash(tx, tokenHash),
    );

    if (accessToken) {
      const claims = decodeAccessTokenUnsafe(accessToken);
      if (claims?.jti) {
        await denyAccessTokenJti(claims.jti, appConfig.jwt.accessTtlSeconds);
      }
      if (claims) {
        await invalidateUserPermissions(claims.organizationId, claims.sub);
      }
    } else if (revoked) {
      await invalidateUserPermissions(revoked.organizationId, revoked.userId);
    }

    return { success: true };
  }

  async me(ctx: RequestContext): Promise<AuthMeResponse> {
    const user = await this.requireActiveUser(ctx);
    const privileged = isPrivilegedRoleSet(user.roleNames);
    const skipLocalTotp =
      user.authSource !== "LOCAL" &&
      (await this.shouldSkipLocalTotp(user.organizationId));
    return this.toMe(user, privileged && !user.mfaEnabled && !skipLocalTotp);
  }

  /** Used by identity federation after IdP proof. Does not verify password. */
  async completeFederatedLogin(
    input: { organizationId: string; userId: string },
    meta: { userAgent?: string; ipAddress?: string; correlationId?: string } = {},
    options: { mfaVerified: boolean } = { mfaVerified: false },
  ): Promise<LoginResult> {
    const user = await this.repo.findUserById(input);
    if (!user || user.status === "DISABLED") {
      throw new UnauthorizedError("Account is disabled");
    }

    const privileged = isPrivilegedRoleSet(user.roleNames);
    if (privileged && user.mfaEnabled && !options.mfaVerified) {
      return {
        mfaRequired: true,
        mfaToken: signMfaChallengeToken({
          userId: user.id,
          organizationId: user.organizationId,
        }),
        expiresIn: 300,
      };
    }

    const activateIfInvited = user.status === "INVITED";
    const tokens = await this.issueSession(user, meta, {
      emitLoginEvent: true,
      activateIfInvited,
      correlationId: meta.correlationId,
      mfaVerified: options.mfaVerified,
    });

    const skipLocalTotp = await this.shouldSkipLocalTotp(user.organizationId);

    return {
      mfaRequired: false,
      user: this.toMe(
        { ...user, status: activateIfInvited ? "ACTIVE" : user.status },
        privileged && !user.mfaEnabled && !skipLocalTotp,
      ),
      tokens,
      mfaEnrollmentRequired: privileged && !user.mfaEnabled && !skipLocalTotp,
    };
  }

  private async safeIdentitySettings(organizationId: string): Promise<{
    enforceSso: boolean;
    allowLocalBreakGlass: boolean;
    disableLocalTotpWhenFederated: boolean;
  }> {
    try {
      const { identitySettingsService } = await import(
        "../../identity/services/identity-settings.service.js"
      );
      return await identitySettingsService.getOrCreate(organizationId);
    } catch {
      // Fail open to LOCAL defaults so password login keeps working if identity
      // tables are not yet migrated or temporarily unavailable.
      return {
        enforceSso: false,
        allowLocalBreakGlass: true,
        disableLocalTotpWhenFederated: false,
      };
    }
  }

  private async shouldSkipLocalTotp(organizationId: string): Promise<boolean> {
    const settings = await this.safeIdentitySettings(organizationId);
    return settings.disableLocalTotpWhenFederated;
  }

  private async createEmailOtpChallenge(
    user: AuthUserRecord,
  ): Promise<LoginMfaChallengeResult> {
    const mfaToken = signMfaChallengeToken({
      userId: user.id,
      organizationId: user.organizationId,
      factor: "EMAIL_OTP",
    });
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const key = `auth:email-otp:${hashToken(mfaToken)}`;
    const redis = getRedis();
    await redis.set(key, hashToken(code), "EX", 300);
    try {
      await this.queueEmailOtp({
        email: user.email,
        code,
        expiresAt: Date.now() + 300_000,
        jobId: `email-otp-${hashToken(mfaToken)}`,
      });
    } catch (error) {
      await redis.del(key);
      throw error;
    }
    return { mfaRequired: true, mfaToken, expiresIn: 300 };
  }

  private codesMatch(expectedHash: string, code: string): boolean {
    const actualHash = hashToken(code);
    return timingSafeEqual(Buffer.from(expectedHash), Buffer.from(actualHash));
  }

  private async queueEmailOtp(input: {
    email: string;
    code: string;
    expiresAt: number;
    jobId: string;
  }): Promise<void> {
    // HTTP tests use the in-memory test mailbox. In normal operation the API
    // only queues delivery; the worker owns SMTP calls and retries.
    if (process.env.VITEST !== undefined) {
      await sendEmailOtp({
        email: input.email,
        code: input.code,
        expiresInSeconds: Math.max(1, Math.floor((input.expiresAt - Date.now()) / 1000)),
      });
      return;
    }
    await emailOtpQueue.add(
      "send-email-otp",
      { email: input.email, code: input.code, expiresAt: input.expiresAt },
      {
        jobId: input.jobId,
        attempts: 3,
        backoff: { type: "exponential", delay: 1_000 },
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    );
  }

  private async requireActiveUser(ctx: RequestContext): Promise<AuthUserRecord> {
    const user = await this.repo.findUserById({
      organizationId: ctx.organizationId,
      userId: ctx.actorUserId,
    });
    if (!user || user.status === "DISABLED") {
      throw new UnauthorizedError("Authentication required");
    }
    return user;
  }

  private toMe(
    user: {
      id: string;
      organizationId: string;
      email: string;
      name: string;
      status: string;
      roleNames: string[];
      permissions: string[];
      mfaEnabled: boolean;
    },
    mfaEnrollmentRequired: boolean,
  ): AuthMeResponse {
    return {
      id: user.id,
      organizationId: user.organizationId,
      email: user.email,
      name: user.name,
      status: user.status,
      roles: user.roleNames,
      permissions: user.permissions,
      mfaEnabled: user.mfaEnabled,
      mfaEnrollmentRequired,
    };
  }

  private async issueSession(
    user: AuthUserRecord,
    meta: { userAgent?: string; ipAddress?: string },
    options: {
      emitLoginEvent: boolean;
      activateIfInvited: boolean;
      correlationId?: string;
      mfaVerified: boolean;
    },
  ): Promise<AuthTokens> {
    return withTransaction(async (tx) =>
      this.issueSessionInTx(tx, user, meta, options),
    );
  }

  private async issueSessionInTx(
    tx: Prisma.TransactionClient,
    user: Pick<
      AuthUserRecord,
      "id" | "organizationId" | "email" | "roleNames" | "permissions" | "authSource"
    >,
    meta: { userAgent?: string; ipAddress?: string },
    options: {
      emitLoginEvent: boolean;
      activateIfInvited: boolean;
      correlationId?: string;
      mfaVerified: boolean;
    },
  ): Promise<AuthTokens> {
    await this.repo.markLoginSuccess(tx, user.id, options.activateIfInvited);

    const jti = generateAccessTokenJti();
    const accessToken = signAccessToken({
      actorUserId: user.id,
      organizationId: user.organizationId,
      permissions: user.permissions,
      roles: user.roleNames,
      jti,
      mfaVerified: options.mfaVerified,
    });

    const refreshToken = generateRefreshToken();
    const expiresAt = new Date(
      Date.now() + appConfig.jwt.refreshTtlSeconds * 1000,
    );

    await this.repo.createRefreshSession(tx, {
      organizationId: user.organizationId,
      userId: user.id,
      tokenHash: hashToken(refreshToken),
      expiresAt,
      userAgent: meta.userAgent,
      ipAddress: meta.ipAddress,
    });

    if (options.emitLoginEvent) {
      await writeOutboxEvent(tx, {
        eventType: DOMAIN_EVENTS.UserLoggedIn,
        organizationId: user.organizationId,
        actorUserId: user.id,
        correlationId: options.correlationId,
        payload: {
          userId: user.id,
          email: user.email,
          authSource: user.authSource,
        },
      });
    }

    await setCachedPermissions(
      user.organizationId,
      user.id,
      {
        permissions: user.permissions,
        roles: user.roleNames,
      },
      appConfig.jwt.accessTtlSeconds,
    );

    return {
      accessToken,
      refreshToken,
      tokenType: "Bearer",
      expiresIn: appConfig.jwt.accessTtlSeconds,
    };
  }
}

export const authService = new AuthService();
