import type {
  Prisma,
  ConsentRecord as PrismaConsentRecord,
  ConsentState,
} from "@prisma/client";

import { prisma } from "../../../infrastructure/database/prisma-client.js";
import { BaseRepository } from "../../../shared/repository/base.repository.js";
import type { RequestContext } from "../../../shared/types/request-context.js";

import {
  asStringArray,
  type ConsentRecordRecord,
} from "../types/consent-record.types.js";

type DbClient = Prisma.TransactionClient | typeof prisma;

export type CreateConsentRecordData = {
  dataSubjectIdentifier: string;
  noticeId?: string;
  dataAssetId?: string;
  purpose: string;
  purposes: string[];
  grantedAt?: Date;
  expiresAt?: Date | null;
  proofFileId?: string;
};

export type ListConsentRecordsOptions = {
  dataAssetId?: string;
  noticeId?: string;
  consentState?: ConsentState;
  dataSubjectIdentifier?: string;
  includeDeleted?: boolean;
};

function mapConsentRecord(row: PrismaConsentRecord): ConsentRecordRecord {
  const purposes = asStringArray(row.purposes);
  return {
    id: row.id,

    organizationId: row.organizationId,

    dataSubjectIdentifier: row.dataSubjectIdentifier,
    noticeId: row.noticeId,
    dataAssetId: row.dataAssetId,

    purpose: purposes[0] ?? row.purpose,
    purposes: purposes.length > 0 ? purposes : row.purpose ? [row.purpose] : [],
    consentState: row.consentState,
    grantedAt: row.grantedAt,
    withdrawnAt: row.withdrawnAt,
    expiresAt: row.expiresAt,
    proofFileId: row.proofFileId,

    createdBy: row.createdBy,
    updatedBy: row.updatedBy,

    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
}

export class ConsentRecordRepository extends BaseRepository {
  async findById(
    organizationId: string,
    id: string,
    options: { includeDeleted?: boolean } = {},
  ): Promise<ConsentRecordRecord | null> {
    const row = await prisma.consentRecord.findFirst({
      where: {
        id,
        ...this.tenantWhere({
          organizationId,
          includeDeleted: options.includeDeleted,
        }),
      },
    });

    return row ? mapConsentRecord(row) : null;
  }

  async list(
    organizationId: string,
    options: ListConsentRecordsOptions = {},
  ): Promise<ConsentRecordRecord[]> {
    const rows = await prisma.consentRecord.findMany({
      where: {
        ...this.tenantWhere({
          organizationId,
          includeDeleted: options.includeDeleted,
        }),
        ...(options.dataAssetId
          ? { dataAssetId: options.dataAssetId }
          : {}),
        ...(options.noticeId ? { noticeId: options.noticeId } : {}),
        ...(options.consentState
          ? { consentState: options.consentState }
          : {}),
        ...(options.dataSubjectIdentifier
          ? { dataSubjectIdentifier: options.dataSubjectIdentifier }
          : {}),
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return rows.map(mapConsentRecord);
  }

  async create(
    db: DbClient,
    ctx: RequestContext,
    data: CreateConsentRecordData,
  ): Promise<ConsentRecordRecord> {
    const row = await db.consentRecord.create({
      data: {
        organizationId: ctx.organizationId,

        dataSubjectIdentifier: data.dataSubjectIdentifier,
        noticeId: data.noticeId,
        dataAssetId: data.dataAssetId,

        purpose: data.purpose,
        purposes: data.purposes,
        grantedAt: data.grantedAt,
        expiresAt: data.expiresAt ?? undefined,
        proofFileId: data.proofFileId,

        ...this.auditCreateFields(ctx),
      },
    });

    return mapConsentRecord(row);
  }

  async withdraw(
    db: DbClient,
    ctx: RequestContext,
    id: string,
  ): Promise<ConsentRecordRecord> {
    const row = await db.consentRecord.update({
      where: { id },
      data: {
        consentState: "WITHDRAWN",
        withdrawnAt: new Date(),
        ...this.auditUpdateFields(ctx),
      },
    });

    return mapConsentRecord(row);
  }
}
