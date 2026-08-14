import { randomUUID } from "node:crypto";
import type { IdentityProviderType, Prisma } from "@prisma/client";
import { prisma } from "../../../infrastructure/database/prisma-client.js";

export class IdentityProviderRepository {
  list(organizationId: string) {
    return prisma.identityProvider.findMany({
      where: { organizationId, deletedAt: null },
      orderBy: { createdAt: "asc" },
    });
  }

  findById(organizationId: string, providerId: string) {
    return prisma.identityProvider.findFirst({
      where: { id: providerId, organizationId, deletedAt: null },
    });
  }

  findEnabledByType(organizationId: string, type: IdentityProviderType) {
    return prisma.identityProvider.findFirst({
      where: { organizationId, type, enabled: true, deletedAt: null },
      orderBy: { updatedAt: "desc" },
    });
  }

  create(data: Prisma.IdentityProviderCreateInput) {
    return prisma.identityProvider.create({
      data: { ...data, id: data.id ?? randomUUID() },
    });
  }

  update(id: string, data: Prisma.IdentityProviderUpdateInput) {
    return prisma.identityProvider.update({ where: { id }, data });
  }

  softDelete(id: string) {
    return prisma.identityProvider.update({
      where: { id },
      data: { deletedAt: new Date(), enabled: false },
    });
  }
}

export const identityProviderRepository = new IdentityProviderRepository();
