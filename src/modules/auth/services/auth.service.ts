import argon2 from "argon2";
import type { Prisma } from "@prisma/client";
import { UnauthorizedError } from "../../../shared/errors/app-error.js";
import { appConfig } from "../../../config/app.config.js";
import { withTransaction } from "../../../infrastructure/database/transaction-manager.js";
import { writeOutboxEvent } from "../../../events/outbox/outbox.repository.js";
import { DOMAIN_EVENTS } from "../../../events/types/base-event.interface.js";
import type { RequestContext } from "../../../shared/types/request-context.js";
import type { LoginDto, LogoutDto, RefreshDto } from "../dto/auth.dto.js";
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
};

export type LoginResult = {
  user: AuthMeResponse;
  tokens: AuthTokens;
};

export class AuthService {
  constructor(private readonly repo = new AuthRepository()) {}

  async login(
    input: LoginDto,
    meta: { userAgent?: string; ipAddress?: string; correlationId?: string } = {},
  ): Promise<LoginResult> {
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

    const passwordOk = await argon2.verify(user.passwordHash, input.password);
    if (!passwordOk) {
      throw new UnauthorizedError("Invalid email or password");
    }

    const activateIfInvited = user.status === "INVITED";
    const tokens = await this.issueSession(user, meta, {
      emitLoginEvent: true,
      activateIfInvited,
      correlationId: meta.correlationId,
    });

    return {
      user: this.toMe({
        ...user,
        status: activateIfInvited ? "ACTIVE" : user.status,
      }),
      tokens,
    };
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

    return withTransaction(async (tx) => {
      await this.repo.revokeRefreshSession(tx, session.id);
      return this.issueSessionInTx(tx, user, meta, {
        emitLoginEvent: false,
        activateIfInvited: false,
        correlationId: meta.correlationId,
      });
    });
  }

  async logout(
    input: LogoutDto,
    accessToken?: string,
  ): Promise<{ success: true }> {
    const tokenHash = hashToken(input.refreshToken);
    await withTransaction(async (tx) => {
      await this.repo.revokeRefreshSessionByHash(tx, tokenHash);
    });

    if (accessToken) {
      const claims = decodeAccessTokenUnsafe(accessToken);
      if (claims?.jti) {
        await denyAccessTokenJti(claims.jti, appConfig.jwt.accessTtlSeconds);
      }
    }

    return { success: true };
  }

  async me(ctx: RequestContext): Promise<AuthMeResponse> {
    const user = await this.repo.findUserById({
      organizationId: ctx.organizationId,
      userId: ctx.actorUserId,
    });
    if (!user || user.status === "DISABLED") {
      throw new UnauthorizedError("Authentication required");
    }
    return this.toMe(user);
  }

  private toMe(user: {
    id: string;
    organizationId: string;
    email: string;
    name: string;
    status: string;
    roleNames: string[];
    permissions: string[];
  }): AuthMeResponse {
    return {
      id: user.id,
      organizationId: user.organizationId,
      email: user.email,
      name: user.name,
      status: user.status,
      roles: user.roleNames,
      permissions: user.permissions,
    };
  }

  private async issueSession(
    user: AuthUserRecord,
    meta: { userAgent?: string; ipAddress?: string },
    options: {
      emitLoginEvent: boolean;
      activateIfInvited: boolean;
      correlationId?: string;
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
      "id" | "organizationId" | "email" | "roleNames" | "permissions"
    >,
    meta: { userAgent?: string; ipAddress?: string },
    options: {
      emitLoginEvent: boolean;
      activateIfInvited: boolean;
      correlationId?: string;
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
        },
      });
    }

    return {
      accessToken,
      refreshToken,
      tokenType: "Bearer",
      expiresIn: appConfig.jwt.accessTtlSeconds,
    };
  }
}

export const authService = new AuthService();
