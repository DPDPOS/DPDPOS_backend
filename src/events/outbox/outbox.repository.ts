import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../infrastructure/database/prisma-client.js";
import type { DomainEventName } from "../types/base-event.interface.js";

export type OutboxWriteInput = {
  eventType: DomainEventName;
  organizationId: string;
  payload: Record<string, unknown>;
  actorUserId?: string;
  correlationId?: string;
};

export async function writeOutboxEvent(
  tx: Prisma.TransactionClient | typeof prisma,
  input: OutboxWriteInput,
): Promise<{ id: string }> {
  const id = randomUUID();
  await tx.outboxEvent.create({
    data: {
      id,
      eventType: input.eventType,
      organizationId: input.organizationId,
      payload: input.payload as Prisma.InputJsonValue,
      actorUserId: input.actorUserId,
      correlationId: input.correlationId,
    },
  });
  return { id };
}

export async function claimUnpublishedOutboxEvents(limit = 50) {
  return prisma.outboxEvent.findMany({
    where: { publishedAt: null },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
}

export async function markOutboxPublished(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await prisma.outboxEvent.updateMany({
    where: { id: { in: ids } },
    data: { publishedAt: new Date() },
  });
}
