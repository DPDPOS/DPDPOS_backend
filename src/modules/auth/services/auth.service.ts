import argon2 from "argon2";
import { randomInt, randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import {
  UnauthorizedError,
  ValidationError,
  RateLimitedError,
} from "../../../shared/errors/app-error.js";
import { appConfig } from "../../../config/app.config.js";
import { getRedis } from "../../../infrastructure/cache/redis-client.js";
import { logger } from "../../../infrastructure/logging/logger.js";
import { enqueueEmailOtp } from "../../../jobs/queues/email-otp.queue.js";
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
  MfaResendDto,
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

const MFA_TTL_SECONDS = 300;
const MFA_MAX_VERIFY_ATTEMPTS = 5;
const MFA_RESEND_COOLDOWN_SECONDS = 30;
const MFA_MAX_RESENDS_PER_15_MINUTES = 5;
const MFA_MAX_IP_RESENDS_PER_HOUR = 20;

type EmailMfaChallenge = {
  userId: string;
  organizationId: string;
  otpHash: string;
  attempts: number;
  resendCount: number;
  lastSentAt: number;
};

export class AuthService {
  constructor(
    private readonly repo = new AuthRepository(),
    private readonly enqueueOtp = enqueueEmailOtp,
  ) {}

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

    // Toggle: AUTH_MFA_ENABLED=false skips email OTP / TOTP (code paths retained).
    if (!appConfig.auth.mfaEnabled) {
      return this.completeLoginWithoutMfaChallenge(user, meta);
    }

    const challenge = await this.createEmailOtpChallenge(user);
    logger.info(
      { userId: user.id, challengeId: this.challengeIdFromToken(challenge.mfaToken) },
      "mfa.challenge_queued",
    );
    return challenge;
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
      if (!claims.challengeId) {
        throw new UnauthorizedError("Invalid MFA challenge");
      }
      const outcome = await this.verifyEmailOtpChallenge(claims, input.code);
      if (outcome !== "VERIFIED") {
        logger.warn({ challengeId: claims.challengeId, userId: claims.sub }, "mfa.verify_failed");
        throw new UnauthorizedError("Invalid or expired MFA code");
      }
    } else {
      if (!user.mfaEnabled || !user.mfaSecretEnc) {
        throw new UnauthorizedError("MFA is not enabled for this account");
      }
      const secret = decryptSecret(user.mfaSecretEnc);
      if (!verifyTotpCode(secret, input.code)) {
        logger.warn({ userId: claims.sub, factor: "TOTP" }, "mfa.verify_failed");
        throw new UnauthorizedError("Invalid MFA code");
      }
    }

    const tokens = await this.issueSession(user, meta, {
      emitLoginEvent: true,
      activateIfInvited: user.status === "INVITED",
      correlationId: meta.correlationId,
      mfaVerified: true,
    });
    logger.info({ userId: user.id, factor: claims.factor }, "mfa.verify_success");

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

  async resendMfa(
    input: MfaResendDto,
    meta: { ipAddress?: string } = {},
  ): Promise<{ mfaRequired: true; expiresIn: number; retryAfterSeconds: number }> {
    const claims = verifyMfaChallengeToken(input.mfaToken);
    if (claims.factor !== "EMAIL_OTP" || !claims.challengeId) {
      throw new UnauthorizedError("This MFA challenge cannot be resent");
    }
    const user = await this.repo.findUserById({ organizationId: claims.organizationId, userId: claims.sub });
    if (!user || user.status === "DISABLED") throw new UnauthorizedError("Invalid MFA challenge");
    const now = Date.now();
    logger.info({ challengeId: claims.challengeId, userId: claims.sub }, "mfa.resend_requested");
    const eligibility = await this.checkEmailOtpResendEligibility(claims, now);
    if (eligibility === "MISSING") throw new UnauthorizedError("Invalid or expired MFA challenge");
    if (eligibility === "COOLDOWN") {
      logger.warn({ challengeId: claims.challengeId, userId: claims.sub, reason: "cooldown" }, "mfa.resend_rate_limited");
      throw new RateLimitedError(`Wait ${MFA_RESEND_COOLDOWN_SECONDS} seconds before requesting another code`);
    }
    if (eligibility === "LIMIT") {
      logger.warn({ challengeId: claims.challengeId, userId: claims.sub, reason: "challenge_limit" }, "mfa.resend_rate_limited");
      throw new RateLimitedError("Too many MFA resend requests");
    }

    const code = this.newOtp();
    const abuseKeys = await this.enforceResendAbuseLimits(claims.sub, meta.ipAddress);
    const updated = await this.rotateEmailOtpForResend(claims, hashToken(code), now);
    if (updated === "MISSING") throw new UnauthorizedError("Invalid or expired MFA challenge");
    if (updated === "COOLDOWN") {
      throw new RateLimitedError(`Wait ${MFA_RESEND_COOLDOWN_SECONDS} seconds before requesting another code`);
    }
    if (updated === "LIMIT") {
      throw new RateLimitedError("Too many MFA resend requests");
    }
    try {
      await this.queueEmailOtp({
        challengeId: claims.challengeId,
        userId: claims.sub,
        email: user.email,
        code,
        expiresAt: now + updated.remainingTtlMs,
        deliveryAttempt: updated.resendCount,
      });
    } catch (error) {
      const restored = await this.restoreEmailOtpAfterQueueFailure(claims, updated);
      await this.releaseResendAbuseLimits(abuseKeys);
      logger.error({ challengeId: claims.challengeId, userId: claims.sub, restored }, "mfa.resend_queue_failed");
      throw error;
    }
    logger.info({ challengeId: claims.challengeId, userId: claims.sub, resendCount: updated.resendCount }, "mfa.resend_queued");
    return {
      mfaRequired: true,
      expiresIn: Math.max(1, Math.ceil(updated.remainingTtlMs / 1_000)),
      retryAfterSeconds: MFA_RESEND_COOLDOWN_SECONDS,
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
      !appConfig.auth.mfaEnabled ||
      (user.authSource !== "LOCAL" &&
        (await this.shouldSkipLocalTotp(user.organizationId)));
    return this.toMe(
      user,
      appConfig.auth.mfaEnabled &&
        privileged &&
        !user.mfaEnabled &&
        !skipLocalTotp,
    );
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
    if (
      appConfig.auth.mfaEnabled &&
      privileged &&
      user.mfaEnabled &&
      !options.mfaVerified
    ) {
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
      mfaVerified: options.mfaVerified || !appConfig.auth.mfaEnabled,
    });

    const skipLocalTotp =
      !appConfig.auth.mfaEnabled ||
      (await this.shouldSkipLocalTotp(user.organizationId));

    return {
      mfaRequired: false,
      user: this.toMe(
        { ...user, status: activateIfInvited ? "ACTIVE" : user.status },
        appConfig.auth.mfaEnabled && privileged && !user.mfaEnabled && !skipLocalTotp,
      ),
      tokens,
      mfaEnrollmentRequired:
        appConfig.auth.mfaEnabled &&
        privileged &&
        !user.mfaEnabled &&
        !skipLocalTotp,
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
    const challengeId = randomUUID();
    const mfaToken = signMfaChallengeToken({
      userId: user.id,
      organizationId: user.organizationId,
      factor: "EMAIL_OTP",
      challengeId,
    });

    const code = this.newOtp();
    const key = this.emailChallengeKey(challengeId);
    const redis = getRedis();
    const challenge: EmailMfaChallenge = {
      userId: user.id,
      organizationId: user.organizationId,
      otpHash: hashToken(code),
      attempts: 0,
      resendCount: 0,
      lastSentAt: Date.now(),
    };
    await redis.set(key, JSON.stringify(challenge), "EX", MFA_TTL_SECONDS);
    try {
      await this.queueEmailOtp({
        challengeId,
        userId: user.id,
        email: user.email,
        code,
        expiresAt: Date.now() + MFA_TTL_SECONDS * 1_000,
        deliveryAttempt: 0,
      });
    } catch (error) {
      await redis.del(key);
      throw error;
    }
    return { mfaRequired: true, mfaToken, expiresIn: MFA_TTL_SECONDS };
  }

  /** Password-login success path when AUTH_MFA_ENABLED=false. */
  private async completeLoginWithoutMfaChallenge(
    user: AuthUserRecord,
    meta: { userAgent?: string; ipAddress?: string; correlationId?: string } = {},
  ): Promise<LoginSuccessResult> {
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

  private async queueEmailOtp(input: {
    challengeId: string;
    userId: string;
    email: string;
    code: string;
    expiresAt: number;
    deliveryAttempt: number;
  }): Promise<void> {
    await this.enqueueOtp(
      { challengeId: input.challengeId, userId: input.userId, email: input.email, code: input.code, expiresAt: input.expiresAt },
        // One logical delivery is idempotent. Resends get a separate delivery
        // suffix while retaining the same challenge identity.
      `mfa:${input.challengeId}:${input.deliveryAttempt}`,
    );
  }

  private newOtp(): string {
    return String(randomInt(0, 1_000_000)).padStart(6, "0");
  }

  private emailChallengeKey(challengeId: string): string {
    return `auth:mfa:email:${challengeId}`;
  }

  private async verifyEmailOtpChallenge(
    claims: { challengeId?: string; sub: string; organizationId: string },
    code: string,
  ): Promise<"VERIFIED" | "INVALID"> {
    const result = await getRedis().eval(
      `local raw = redis.call('GET', KEYS[1])
       if not raw then return 0 end
       local value = cjson.decode(raw)
       if value.userId ~= ARGV[1] or value.organizationId ~= ARGV[2] then return 0 end
       if value.attempts >= tonumber(ARGV[4]) then redis.call('DEL', KEYS[1]); return 0 end
       if value.otpHash == ARGV[3] then redis.call('DEL', KEYS[1]); return 1 end
       value.attempts = value.attempts + 1
       if value.attempts >= tonumber(ARGV[4]) then redis.call('DEL', KEYS[1]) else redis.call('SET', KEYS[1], cjson.encode(value), 'KEEPTTL') end
       return 0`,
      1,
      this.emailChallengeKey(claims.challengeId!),
      claims.sub,
      claims.organizationId,
      hashToken(code),
      String(MFA_MAX_VERIFY_ATTEMPTS),
    );
    return Number(result) === 1 ? "VERIFIED" : "INVALID";
  }

  private async checkEmailOtpResendEligibility(
    claims: { challengeId?: string; sub: string; organizationId: string },
    now: number,
  ): Promise<"MISSING" | "COOLDOWN" | "LIMIT" | "ELIGIBLE"> {
    const raw = await getRedis().get(this.emailChallengeKey(claims.challengeId!));
    if (!raw) return "MISSING";
    let challenge: EmailMfaChallenge;
    try {
      challenge = JSON.parse(raw) as EmailMfaChallenge;
    } catch {
      return "MISSING";
    }
    if (challenge.userId !== claims.sub || challenge.organizationId !== claims.organizationId) return "MISSING";
    if (now - challenge.lastSentAt < MFA_RESEND_COOLDOWN_SECONDS * 1_000) return "COOLDOWN";
    if (challenge.resendCount >= MFA_MAX_RESENDS_PER_15_MINUTES) return "LIMIT";
    return "ELIGIBLE";
  }

  private async rotateEmailOtpForResend(
    claims: { challengeId?: string; sub: string; organizationId: string },
    otpHash: string,
    now: number,
  ): Promise<"MISSING" | "COOLDOWN" | "LIMIT" | { resendCount: number; remainingTtlMs: number; previousRaw: string; previousTtlMs: number; otpHash: string; lastSentAt: number }> {
    const result = await getRedis().eval(
      `local raw = redis.call('GET', KEYS[1])
       if not raw then return {-1} end
       local value = cjson.decode(raw)
       if value.userId ~= ARGV[1] or value.organizationId ~= ARGV[2] then return {-1} end
       if tonumber(ARGV[3]) - value.lastSentAt < tonumber(ARGV[4]) then return {0} end
       if value.resendCount >= tonumber(ARGV[5]) then return {-2} end
       value.otpHash = ARGV[6]
       value.attempts = 0
       value.resendCount = value.resendCount + 1
       value.lastSentAt = tonumber(ARGV[3])
       redis.call('SET', KEYS[1], cjson.encode(value), 'KEEPTTL')
       return {value.resendCount, redis.call('PTTL', KEYS[1]), raw, value.otpHash, value.lastSentAt}`,
      1,
      this.emailChallengeKey(claims.challengeId!),
      claims.sub,
      claims.organizationId,
      String(now),
      String(MFA_RESEND_COOLDOWN_SECONDS * 1_000),
      String(MFA_MAX_RESENDS_PER_15_MINUTES),
      otpHash,
    ) as unknown as Array<number | string>;
    if (result[0] === -1) return "MISSING";
    if (result[0] === 0) return "COOLDOWN";
    if (result[0] === -2) return "LIMIT";
    return {
      resendCount: Number(result[0]),
      remainingTtlMs: Math.max(1_000, Number(result[1])),
      previousRaw: String(result[2]),
      previousTtlMs: Math.max(1_000, Number(result[1])),
      otpHash,
      lastSentAt: now,
    };
  }

  private async restoreEmailOtpAfterQueueFailure(
    claims: { challengeId?: string; sub: string; organizationId: string },
    updated: { resendCount: number; previousRaw: string; previousTtlMs: number; otpHash: string; lastSentAt: number },
  ): Promise<boolean> {
    const result = await getRedis().eval(
      `local raw = redis.call('GET', KEYS[1])
       if not raw then return 0 end
       local value = cjson.decode(raw)
       if value.userId ~= ARGV[1] or value.organizationId ~= ARGV[2] then return 0 end
       if value.otpHash ~= ARGV[3] or value.resendCount ~= tonumber(ARGV[4]) or value.lastSentAt ~= tonumber(ARGV[5]) then return 0 end
       redis.call('SET', KEYS[1], ARGV[6], 'PX', ARGV[7])
       return 1`,
      1,
      this.emailChallengeKey(claims.challengeId!),
      claims.sub,
      claims.organizationId,
      updated.otpHash,
      String(updated.resendCount),
      String(updated.lastSentAt),
      updated.previousRaw,
      String(updated.previousTtlMs),
    );
    return Number(result) === 1;
  }

  private async enforceResendAbuseLimits(userId: string, ipAddress?: string): Promise<string[]> {
    const redis = getRedis();
    const userKey = `auth:mfa:resend:user:${userId}`;
    const userCount = await redis.incr(userKey);
    if (userCount === 1) await redis.expire(userKey, 900);
    if (userCount > MFA_MAX_RESENDS_PER_15_MINUTES) {
      logger.warn({ userId, reason: "account_limit" }, "mfa.resend_rate_limited");
      throw new RateLimitedError("Too many MFA resend requests for this account");
    }
    if (!ipAddress) return [userKey];
    const key = `auth:mfa:resend:ip:${hashToken(ipAddress)}`;
    const ipCount = await redis.incr(key);
    if (ipCount === 1) await redis.expire(key, 3_600);
    if (ipCount > MFA_MAX_IP_RESENDS_PER_HOUR) {
      logger.warn({ userId, reason: "ip_limit" }, "mfa.resend_rate_limited");
      throw new RateLimitedError("Too many MFA resend requests from this network");
    }
    return [userKey, key];
  }

  private async releaseResendAbuseLimits(keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    await getRedis().eval(
      `for _, key in ipairs(KEYS) do
         local count = redis.call('DECR', key)
         if count <= 0 then redis.call('DEL', key) end
       end
       return 1`,
      keys.length,
      ...keys,
    );
  }

  private challengeIdFromToken(token: string): string | undefined {
    return verifyMfaChallengeToken(token).challengeId;
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
