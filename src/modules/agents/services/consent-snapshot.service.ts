import { createHash } from "node:crypto";
import { prisma } from "../../../infrastructure/database/prisma-client.js";

const hashIdentifier = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

export class ConsentSnapshotService {
  async getSnapshot(organizationId: string, since?: Date) {
    const records = await prisma.consentRecord.findMany({
      where: {
        organizationId,
        deletedAt: null,
        ...(since ? { updatedAt: { gt: since } } : {}),
      },
      select: {
        dataSubjectIdentifier: true,
        purpose: true,
        consentState: true,
        updatedAt: true,
        notice: { select: { version: true } },
      },
      orderBy: { updatedAt: "asc" },
      take: 10_000,
    });

    return {
      organizationId,
      since: since?.toISOString() ?? null,
      generatedAt: new Date().toISOString(),
      records: records.map((record) => ({
        identifierHash: hashIdentifier(record.dataSubjectIdentifier),
        purpose: record.purpose,
        state: record.consentState,
        noticeVersion: record.notice?.version ?? null,
        updatedAt: record.updatedAt.toISOString(),
      })),
    };
  }
}

export const consentSnapshotService = new ConsentSnapshotService();
