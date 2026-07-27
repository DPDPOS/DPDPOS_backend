import type { Prisma, UserStatus } from "@prisma/client";
import { BaseRepository } from "../../../shared/repository/base.repository.js";
import { prisma } from "../../../infrastructure/database/prisma-client.js";

type DbClient = Prisma.TransactionClient | typeof prisma;

export type AuthUserRecord = {
  id: string;
  organizationId: string;
  email: string;
  name: string;
  passwordHash: string | null;
  status: UserStatus;
  mfaEnabled: boolean;
  mfaSecretEnc: string | null;
  roleNames: string[];
  permissions: string[];
};

function mapAuthUser(row: {
  id: string;
  organizationId: string;
  email: string;
  name: string;
  passwordHash: string | null;
  status: UserStatus;
  mfaEnabled: boolean;
  mfaSecretEnc: string | null;
  userRoles: Array<{
    role: { name: string; permissions: string[]; deletedAt: Date | null };
  }>;
}): AuthUserRecord {
  const activeRoles = row.userRoles
    .map((ur) => ur.role)
    .filter((role) => role.deletedAt === null);

  return {
    id: row.id,
    organizationId: row.organizationId,
    email: row.email,
    name: row.name,
    passwordHash: row.passwordHash,
    status: row.status,
    mfaEnabled: row.mfaEnabled,
    mfaSecretEnc: row.mfaSecretEnc,
    roleNames: activeRoles.map((role) => role.name),
    permissions: [...new Set(activeRoles.flatMap((role) => role.permissions))],
  };
}

const userAuthInclude = {
  userRoles: {
    include: {
      role: {
        select: {
          name: true,
          permissions: true,
          deletedAt: true,
        },
      },
    },
  },
} as const;

export class AuthRepository extends BaseRepository {
  async findUserForLogin(input: {
    organizationId: string;
    email: string;
  }): Promise<AuthUserRecord | null> {
    const row = await prisma.user.findFirst({
      where: {
        organizationId: input.organizationId,
        email: input.email.toLowerCase(),
        deletedAt: null,
      },
      include: userAuthInclude,
    });
    return row ? mapAuthUser(row) : null;
  }

  async findUserById(input: {
    organizationId: string;
    userId: string;
  }): Promise<AuthUserRecord | null> {
    const row = await prisma.user.findFirst({
      where: {
        id: input.userId,
        organizationId: input.organizationId,
        deletedAt: null,
      },
      include: userAuthInclude,
    });
    return row ? mapAuthUser(row) : null;
  }

  async findUserForInviteAccept(input: {
    organizationId: string;
    email: string;
  }) {
    return prisma.user.findFirst({
      where: {
        organizationId: input.organizationId,
        email: input.email.toLowerCase(),
        deletedAt: null,
        status: "INVITED",
      },
      select: {
        id: true,
        organizationId: true,
        email: true,
        name: true,
        inviteTokenHash: true,
        inviteExpiresAt: true,
        passwordHash: true,
      },
    });
  }

  async acceptInvite(
    db: DbClient,
    userId: string,
    passwordHash: string,
  ): Promise<void> {
    await db.user.update({
      where: { id: userId },
      data: {
        passwordHash,
        inviteTokenHash: null,
        inviteExpiresAt: null,
        status: "ACTIVE",
      },
    });
  }

  async markLoginSuccess(
    db: DbClient,
    userId: string,
    activateIfInvited: boolean,
  ): Promise<void> {
    await db.user.update({
      where: { id: userId },
      data: {
        lastLoginAt: new Date(),
        ...(activateIfInvited ? { status: "ACTIVE" as const } : {}),
      },
    });
  }

  async saveMfaPendingSecret(
    db: DbClient,
    userId: string,
    mfaSecretEnc: string,
  ): Promise<void> {
    await db.user.update({
      where: { id: userId },
      data: {
        mfaSecretEnc,
        mfaEnabled: false,
      },
    });
  }

  async enableMfa(db: DbClient, userId: string): Promise<void> {
    await db.user.update({
      where: { id: userId },
      data: { mfaEnabled: true },
    });
  }

  async disableMfa(db: DbClient, userId: string): Promise<void> {
    await db.user.update({
      where: { id: userId },
      data: {
        mfaEnabled: false,
        mfaSecretEnc: null,
      },
    });
  }

  async createRefreshSession(
    db: DbClient,
    data: {
      organizationId: string;
      userId: string;
      tokenHash: string;
      expiresAt: Date;
      userAgent?: string;
      ipAddress?: string;
    },
  ): Promise<{ id: string }> {
    const row = await db.refreshSession.create({
      data: {
        organizationId: data.organizationId,
        userId: data.userId,
        tokenHash: data.tokenHash,
        expiresAt: data.expiresAt,
        userAgent: data.userAgent,
        ipAddress: data.ipAddress,
      },
      select: { id: true },
    });
    return row;
  }

  async findActiveRefreshSession(tokenHash: string) {
    return prisma.refreshSession.findFirst({
      where: {
        tokenHash,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
  }

  async revokeRefreshSession(db: DbClient, sessionId: string): Promise<void> {
    await db.refreshSession.update({
      where: { id: sessionId },
      data: { revokedAt: new Date() },
    });
  }

  async revokeRefreshSessionByHash(
    db: DbClient,
    tokenHash: string,
  ): Promise<{ id: string; userId: string; organizationId: string } | null> {
    const existing = await db.refreshSession.findFirst({
      where: { tokenHash, revokedAt: null },
      select: { id: true, userId: true, organizationId: true },
    });
    if (!existing) return null;
    await db.refreshSession.update({
      where: { id: existing.id },
      data: { revokedAt: new Date() },
    });
    return existing;
  }
}
