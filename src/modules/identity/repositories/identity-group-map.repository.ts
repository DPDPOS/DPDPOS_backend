import { randomUUID } from "node:crypto";
import { prisma } from "../../../infrastructure/database/prisma-client.js";

export class IdentityGroupMapRepository {
  list(organizationId: string, providerId?: string) {
    return prisma.identityGroupRoleMap.findMany({
      where: {
        organizationId,
        ...(providerId ? { providerId } : {}),
      },
      include: {
        role: { select: { id: true, name: true } },
        provider: { select: { id: true, name: true, type: true } },
      },
      orderBy: { createdAt: "asc" },
    });
  }

  create(input: {
    organizationId: string;
    providerId: string;
    externalGroupId: string;
    externalGroupName?: string | null;
    roleId: string;
  }) {
    return prisma.identityGroupRoleMap.create({
      data: {
        id: randomUUID(),
        organizationId: input.organizationId,
        providerId: input.providerId,
        externalGroupId: input.externalGroupId,
        externalGroupName: input.externalGroupName ?? null,
        roleId: input.roleId,
      },
      include: {
        role: { select: { id: true, name: true } },
      },
    });
  }

  delete(organizationId: string, mapId: string) {
    return prisma.identityGroupRoleMap.deleteMany({
      where: { id: mapId, organizationId },
    });
  }

  findRoleIdsForGroups(
    organizationId: string,
    providerId: string,
    externalGroupIds: string[],
  ) {
    if (externalGroupIds.length === 0) return Promise.resolve([] as string[]);
    return prisma.identityGroupRoleMap
      .findMany({
        where: {
          organizationId,
          providerId,
          externalGroupId: { in: externalGroupIds },
        },
        select: { roleId: true },
      })
      .then((rows) => [...new Set(rows.map((r) => r.roleId))]);
  }
}

export const identityGroupMapRepository = new IdentityGroupMapRepository();
