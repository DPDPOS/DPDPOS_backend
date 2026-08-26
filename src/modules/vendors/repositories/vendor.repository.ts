import type { Prisma, Vendor as PrismaVendor } from "@prisma/client";
import { prisma } from "../../../infrastructure/database/prisma-client.js";
import { BaseRepository } from "../../../shared/repository/base.repository.js";
import type { RequestContext } from "../../../shared/types/request-context.js";
import type { VendorRecord } from "../types/vendor.types.js";

type DbClient = Prisma.TransactionClient | typeof prisma;

function mapVendor(row: PrismaVendor): VendorRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    legalName: row.legalName,
    vendorType: row.vendorType,
    countries: row.countries,
    services: row.services,
    dataCategories: row.dataCategories,
    criticality: row.criticality,
    status: row.status,
    inherentRiskScore: row.inherentRiskScore,
    residualRiskScore: row.residualRiskScore,
    nextReviewAt: row.nextReviewAt,
    ownerUserId: row.ownerUserId,
    notes: row.notes,
    version: row.version,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
}

export type CreateVendorData = {
  name: string;
  legalName?: string;
  vendorType?: "PROCESSOR" | "SUB_PROCESSOR" | "JOINT" | "OTHER";
  countries?: string[];
  services?: string;
  dataCategories?: string[];
  criticality?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  status?: "DRAFT" | "ACTIVE" | "SUSPENDED" | "OFFBOARDED";
  nextReviewAt?: Date;
  ownerUserId?: string;
  notes?: string;
  inherentRiskScore?: number;
  residualRiskScore?: number;
};

export type UpdateVendorData = Partial<CreateVendorData> & {
  version: number;
};

export class VendorRepository extends BaseRepository {
  async findById(
    organizationId: string,
    id: string,
  ): Promise<VendorRecord | null> {
    const row = await prisma.vendor.findFirst({
      where: { id, ...this.tenantWhere({ organizationId }) },
    });
    return row ? mapVendor(row) : null;
  }

  async list(
    organizationId: string,
    options: {
      status?: string;
      criticality?: string;
      vendorType?: string;
    } = {},
  ): Promise<VendorRecord[]> {
    const rows = await prisma.vendor.findMany({
      where: {
        ...this.tenantWhere({ organizationId }),
        ...(options.status
          ? { status: options.status as PrismaVendor["status"] }
          : {}),
        ...(options.criticality
          ? { criticality: options.criticality as PrismaVendor["criticality"] }
          : {}),
        ...(options.vendorType
          ? { vendorType: options.vendorType as PrismaVendor["vendorType"] }
          : {}),
      },
      orderBy: { createdAt: "desc" },
    });
    return rows.map(mapVendor);
  }

  async countActive(organizationId: string): Promise<number> {
    return prisma.vendor.count({
      where: {
        ...this.tenantWhere({ organizationId }),
        status: "ACTIVE",
      },
    });
  }

  async create(
    db: DbClient,
    ctx: RequestContext,
    data: CreateVendorData,
  ): Promise<VendorRecord> {
    const row = await db.vendor.create({
      data: {
        organizationId: ctx.organizationId,
        name: data.name,
        legalName: data.legalName,
        vendorType: data.vendorType ?? "PROCESSOR",
        countries: data.countries ?? [],
        services: data.services,
        dataCategories: data.dataCategories ?? [],
        criticality: data.criticality ?? "MEDIUM",
        status: data.status ?? "DRAFT",
        nextReviewAt: data.nextReviewAt,
        ownerUserId: data.ownerUserId,
        notes: data.notes,
        inherentRiskScore: data.inherentRiskScore,
        residualRiskScore: data.residualRiskScore,
        ...this.auditCreateFields(ctx),
      },
    });
    return mapVendor(row);
  }

  async update(
    db: DbClient,
    ctx: RequestContext,
    id: string,
    data: UpdateVendorData,
  ): Promise<VendorRecord | null> {
    const result = await db.vendor.updateMany({
      where: {
        id,
        organizationId: ctx.organizationId,
        version: data.version,
        deletedAt: null,
      },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.legalName !== undefined ? { legalName: data.legalName } : {}),
        ...(data.vendorType !== undefined ? { vendorType: data.vendorType } : {}),
        ...(data.countries !== undefined ? { countries: data.countries } : {}),
        ...(data.services !== undefined ? { services: data.services } : {}),
        ...(data.dataCategories !== undefined
          ? { dataCategories: data.dataCategories }
          : {}),
        ...(data.criticality !== undefined
          ? { criticality: data.criticality }
          : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(data.nextReviewAt !== undefined
          ? { nextReviewAt: data.nextReviewAt }
          : {}),
        ...(data.ownerUserId !== undefined
          ? { ownerUserId: data.ownerUserId }
          : {}),
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
        ...(data.inherentRiskScore !== undefined
          ? { inherentRiskScore: data.inherentRiskScore }
          : {}),
        ...(data.residualRiskScore !== undefined
          ? { residualRiskScore: data.residualRiskScore }
          : {}),
        version: { increment: 1 },
        ...this.auditUpdateFields(ctx),
      },
    });
    if (result.count === 0) return null;
    return this.findById(ctx.organizationId, id);
  }

  async softDelete(
    db: DbClient,
    ctx: RequestContext,
    id: string,
  ): Promise<VendorRecord> {
    const existing = await db.vendor.findFirst({
      where: {
        id,
        organizationId: ctx.organizationId,
        deletedAt: null,
      },
    });
    if (!existing) {
      throw new Error("Vendor not found for offboard");
    }
    const row = await db.vendor.update({
      where: { id: existing.id },
      data: {
        deletedAt: new Date(),
        status: "OFFBOARDED",
        ...this.auditUpdateFields(ctx),
      },
    });
    return mapVendor(row);
  }
}
