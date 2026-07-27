import type { Prisma, Organization as PrismaOrganization } from "@prisma/client";
import { BaseRepository } from "../../../shared/repository/base.repository.js";
import { prisma } from "../../../infrastructure/database/prisma-client.js";
import type { OrganizationRecord } from "../types/organization.types.js";

type DbClient = Prisma.TransactionClient | typeof prisma;

export type CreateOrganizationData = {
  name: string;
  industry?: string;
  companySize?: string;
  operatingRegion?: string;
  companyType?: string;
  maturityLevel?: string;
  isSignificantDataFiduciary?: boolean;
  createdBy?: string;
  updatedBy?: string;
};

export type UpdateOrganizationData = {
  name?: string;
  industry?: string | null;
  companySize?: string | null;
  operatingRegion?: string | null;
  companyType?: string | null;
  maturityLevel?: string | null;
  isSignificantDataFiduciary?: boolean;
  updatedBy?: string;
};

function mapOrganization(row: PrismaOrganization): OrganizationRecord {
  return {
    id: row.id,
    name: row.name,
    industry: row.industry,
    companySize: row.companySize,
    operatingRegion: row.operatingRegion,
    companyType: row.companyType,
    maturityLevel: row.maturityLevel,
    isSignificantDataFiduciary: row.isSignificantDataFiduciary,
    status: row.status,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
}

/**
 * Organization is the tenant root — queries are by organization id directly.
 */
export class OrganizationRepository extends BaseRepository {
  async findById(
    id: string,
    options: { includeDeleted?: boolean } = {},
  ): Promise<OrganizationRecord | null> {
    const row = await prisma.organization.findFirst({
      where: {
        id,
        ...(options.includeDeleted ? {} : { deletedAt: null }),
      },
    });
    return row ? mapOrganization(row) : null;
  }

  async create(
    db: DbClient,
    data: CreateOrganizationData,
  ): Promise<OrganizationRecord> {
    const row = await db.organization.create({
      data: {
        name: data.name,
        industry: data.industry,
        companySize: data.companySize,
        operatingRegion: data.operatingRegion,
        companyType: data.companyType,
        maturityLevel: data.maturityLevel,
        isSignificantDataFiduciary: data.isSignificantDataFiduciary ?? false,
        createdBy: data.createdBy,
        updatedBy: data.updatedBy ?? data.createdBy,
      },
    });
    return mapOrganization(row);
  }

  async update(
    db: DbClient,
    id: string,
    data: UpdateOrganizationData,
  ): Promise<OrganizationRecord> {
    const row = await db.organization.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.industry !== undefined ? { industry: data.industry } : {}),
        ...(data.companySize !== undefined ? { companySize: data.companySize } : {}),
        ...(data.operatingRegion !== undefined
          ? { operatingRegion: data.operatingRegion }
          : {}),
        ...(data.companyType !== undefined ? { companyType: data.companyType } : {}),
        ...(data.maturityLevel !== undefined
          ? { maturityLevel: data.maturityLevel }
          : {}),
        ...(data.isSignificantDataFiduciary !== undefined
          ? { isSignificantDataFiduciary: data.isSignificantDataFiduciary }
          : {}),
        ...(data.updatedBy !== undefined ? { updatedBy: data.updatedBy } : {}),
      },
    });
    return mapOrganization(row);
  }

  async createSystemRoles(
    db: DbClient,
    organizationId: string,
    roles: Array<{ name: string; permissions: string[] }>,
  ): Promise<string[]> {
    const createdNames: string[] = [];
    for (const role of roles) {
      await db.role.create({
        data: {
          organizationId,
          name: role.name,
          description: `System role: ${role.name}`,
          permissions: role.permissions,
          isSystemRole: true,
        },
      });
      createdNames.push(role.name);
    }
    return createdNames;
  }

  async listRoleNames(organizationId: string): Promise<string[]> {
    const rows = await prisma.role.findMany({
      where: { organizationId, deletedAt: null },
      select: { name: true },
      orderBy: { name: "asc" },
    });
    return rows.map((r) => r.name);
  }
}
