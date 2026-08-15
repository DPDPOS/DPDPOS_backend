import { randomUUID } from "node:crypto";
import type { IdentityMode, Prisma } from "@prisma/client";
import { prisma } from "../../../infrastructure/database/prisma-client.js";
import { NotFoundError } from "../../../shared/errors/app-error.js";

export class IdentitySettingsRepository {
  async get(organizationId: string) {
    return prisma.organizationIdentitySettings.findUnique({
      where: { organizationId },
    });
  }

  async getOrCreate(organizationId: string) {
    const existing = await this.get(organizationId);
    if (existing) return existing;

    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true },
    });
    if (!organization) {
      throw new NotFoundError("Organization not found");
    }

    return prisma.organizationIdentitySettings.create({
      data: {
        id: randomUUID(),
        organizationId,
        mode: "LOCAL",
      },
    });
  }

  async update(
    organizationId: string,
    data: Prisma.OrganizationIdentitySettingsUpdateInput,
  ) {
    await this.getOrCreate(organizationId);
    return prisma.organizationIdentitySettings.update({
      where: { organizationId },
      data,
    });
  }
}

export const identitySettingsRepository = new IdentitySettingsRepository();

export type IdentitySettingsRecord = Awaited<
  ReturnType<IdentitySettingsRepository["getOrCreate"]>
>;

export type { IdentityMode };
