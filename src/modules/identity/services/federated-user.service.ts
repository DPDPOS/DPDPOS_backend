import { randomUUID } from "node:crypto";
import type { UserAuthSource } from "@prisma/client";
import { prisma } from "../../../infrastructure/database/prisma-client.js";
import { ConflictError, ForbiddenError, ValidationError } from "../../../shared/errors/app-error.js";
import { invalidateUserPermissions } from "../../../infrastructure/cache/permission-cache.js";
import { identityGroupMapRepository } from "../repositories/identity-group-map.repository.js";
import { identitySettingsRepository } from "../repositories/identity-settings.repository.js";

export type FederatedIdentity = {
  organizationId: string;
  providerId: string;
  authSource: UserAuthSource;
  externalSubject: string;
  externalIssuer: string;
  email: string;
  name: string;
  upn?: string | null;
  groupIds?: string[];
};

export class FederatedUserService {
  async upsertFromIdp(identity: FederatedIdentity): Promise<{ userId: string }> {
    const email = identity.email.trim().toLowerCase();
    if (!email) {
      throw new ValidationError("Directory account has no email claim");
    }

    const settings = await identitySettingsRepository.getOrCreate(identity.organizationId);

    const byExternal = await prisma.user.findFirst({
      where: {
        organizationId: identity.organizationId,
        externalSubject: identity.externalSubject,
        deletedAt: null,
      },
    });

    let userId: string;

    if (byExternal) {
      if (byExternal.status === "DISABLED") {
        throw new ForbiddenError("Account is disabled");
      }
      await prisma.user.update({
        where: { id: byExternal.id },
        data: {
          name: identity.name || byExternal.name,
          email,
          upn: identity.upn ?? byExternal.upn,
          externalIssuer: identity.externalIssuer,
          authSource: identity.authSource,
        },
      });
      userId = byExternal.id;
    } else {
      const byEmail = await prisma.user.findFirst({
        where: {
          organizationId: identity.organizationId,
          email,
          deletedAt: null,
        },
      });

      if (byEmail) {
        if (byEmail.externalSubject && byEmail.externalSubject !== identity.externalSubject) {
          throw new ConflictError("Email is already linked to another directory identity");
        }
        if (byEmail.status === "DISABLED") {
          throw new ForbiddenError("Account is disabled");
        }
        await prisma.user.update({
          where: { id: byEmail.id },
          data: {
            externalSubject: identity.externalSubject,
            externalIssuer: identity.externalIssuer,
            authSource: identity.authSource,
            upn: identity.upn ?? byEmail.upn,
            name: identity.name || byEmail.name,
            status: byEmail.status === "INVITED" ? "ACTIVE" : byEmail.status,
          },
        });
        userId = byEmail.id;
      } else if (!settings.jitProvisioningEnabled) {
        throw new ForbiddenError(
          "No DPDPOS account for this directory user. Ask an admin to invite you or enable JIT provisioning.",
        );
      } else {
        const created = await prisma.user.create({
          data: {
            id: randomUUID(),
            organizationId: identity.organizationId,
            email,
            name: identity.name || email,
            status: "ACTIVE",
            authSource: identity.authSource,
            externalSubject: identity.externalSubject,
            externalIssuer: identity.externalIssuer,
            upn: identity.upn ?? null,
            passwordHash: null,
          },
        });
        userId = created.id;

        if (settings.defaultRoleName) {
          const role = await prisma.role.findFirst({
            where: {
              organizationId: identity.organizationId,
              name: settings.defaultRoleName,
              deletedAt: null,
            },
          });
          if (role) {
            await prisma.userRole.create({
              data: {
                id: randomUUID(),
                organizationId: identity.organizationId,
                userId,
                roleId: role.id,
              },
            });
          }
        }
      }
    }

    await this.applyGroupRoles({
      organizationId: identity.organizationId,
      providerId: identity.providerId,
      userId,
      groupIds: identity.groupIds ?? [],
    });

    await invalidateUserPermissions(identity.organizationId, userId);
    return { userId };
  }

  async applyGroupRoles(input: {
    organizationId: string;
    providerId: string;
    userId: string;
    groupIds: string[];
  }): Promise<void> {
    const mappedRoleIds = await identityGroupMapRepository.findRoleIdsForGroups(
      input.organizationId,
      input.providerId,
      input.groupIds,
    );
    if (mappedRoleIds.length === 0) return;

    const existing = await prisma.userRole.findMany({
      where: { userId: input.userId, organizationId: input.organizationId },
      select: { roleId: true },
    });
    const existingSet = new Set(existing.map((e) => e.roleId));

    for (const roleId of mappedRoleIds) {
      if (existingSet.has(roleId)) continue;
      await prisma.userRole.create({
        data: {
          id: randomUUID(),
          organizationId: input.organizationId,
          userId: input.userId,
          roleId,
        },
      });
    }
  }
}

export const federatedUserService = new FederatedUserService();
