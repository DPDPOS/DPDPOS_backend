import { createHash } from "node:crypto";
import { Prisma, type LedgerActorType } from "@prisma/client";
import { prisma } from "../../../infrastructure/database/prisma-client.js";

type AppendLedgerEvent = {
  organizationId: string;
  eventType: string;
  actorType: LedgerActorType;
  actorId?: string | null;
  objectType: string;
  objectId: string;
  payload?: unknown;
  occurredAt?: Date;
};

const digest = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

const computeEntryHash = (input: {
  organizationId: string;
  sequence: bigint;
  eventType: string;
  actorType: LedgerActorType;
  actorId?: string | null;
  objectType: string;
  objectId: string;
  payloadHash: string;
  previousHash?: string | null;
  occurredAt: Date;
}): string =>
  digest(
    [
      input.organizationId,
      input.sequence.toString(),
      input.eventType,
      input.actorType,
      input.actorId ?? "",
      input.objectType,
      input.objectId,
      input.payloadHash,
      input.previousHash ?? "GENESIS",
      input.occurredAt.toISOString(),
    ].join("|"),
  );

export class EvidenceLedgerService {
  async appendEvent(input: AppendLedgerEvent) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await prisma.$transaction(
          async (tx) => {
            const previous = await tx.evidenceLedgerEntry.findFirst({
              where: { organizationId: input.organizationId },
              orderBy: { sequence: "desc" },
            });
            const sequence = (previous?.sequence ?? 0n) + 1n;
            const occurredAt = input.occurredAt ?? new Date();
            const payloadHash = digest(JSON.stringify(input.payload ?? {}));
            const entryHash = computeEntryHash({
              ...input,
              sequence,
              payloadHash,
              previousHash: previous?.entryHash ?? null,
              occurredAt,
            });
            return tx.evidenceLedgerEntry.create({
              data: {
                organizationId: input.organizationId,
                sequence,
                actorType: input.actorType,
                actorId: input.actorId,
                action: input.eventType,
                entityType: input.objectType,
                entityId: input.objectId,
                payloadHash,
                previousHash: previous?.entryHash ?? null,
                entryHash,
                metadataJson: (input.payload ?? {}) as Prisma.InputJsonValue,
                occurredAt,
              },
            });
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        const retryable =
          error instanceof Prisma.PrismaClientKnownRequestError &&
          (error.code === "P2002" || error.code === "P2034");
        if (!retryable || attempt === 2) throw error;
      }
    }
    throw new Error("Unable to append evidence ledger entry");
  }

  async verifyIntegrity(organizationId: string) {
    const entries = await prisma.evidenceLedgerEntry.findMany({
      where: { organizationId },
      orderBy: { sequence: "asc" },
    });
    let previousHash: string | null = null;
    let expectedSequence = 1n;
    for (const entry of entries) {
      const expectedHash = computeEntryHash({
        organizationId,
        sequence: entry.sequence,
        eventType: entry.action,
        actorType: entry.actorType,
        actorId: entry.actorId,
        objectType: entry.entityType,
        objectId: entry.entityId,
        payloadHash: entry.payloadHash,
        previousHash,
        occurredAt: entry.occurredAt,
      });
      if (
        entry.sequence !== expectedSequence ||
        entry.previousHash !== previousHash ||
        entry.entryHash !== expectedHash
      ) {
        return {
          valid: false,
          entryCount: entries.length,
          brokenAtId: entry.id,
          sequence: entry.sequence.toString(),
          expectedHash,
          actualHash: entry.entryHash,
        };
      }
      previousHash = entry.entryHash;
      expectedSequence += 1n;
    }
    return {
      valid: true,
      entryCount: entries.length,
      brokenAtId: null,
      sequence: null,
      expectedHash: null,
      actualHash: null,
    };
  }

  async exportEntries(
    organizationId: string,
    range: { from?: Date; to?: Date },
  ) {
    const entries = await prisma.evidenceLedgerEntry.findMany({
      where: {
        organizationId,
        ...((range.from || range.to) && {
          occurredAt: { ...(range.from && { gte: range.from }), ...(range.to && { lte: range.to }) },
        }),
      },
      orderBy: { sequence: "asc" },
    });
    return entries.map((entry) => ({
      ...entry,
      sequence: entry.sequence.toString(),
    }));
  }
}

export const evidenceLedgerService = new EvidenceLedgerService();
