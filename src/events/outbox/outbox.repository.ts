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

export type ClaimedOutboxEvent = {
  id: string;
  organizationId: string;
  eventType: string;
  payload: Prisma.JsonValue;
  actorUserId: string | null;
  correlationId: string | null;
  createdAt: Date;
  attempts: number;
  lockToken: string;
};

const LOCK_STALE_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 10;

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

/**
 * Atomically claim unpublished outbox rows using FOR UPDATE SKIP LOCKED.
 * Stale locks older than 5 minutes are reclaimable. Failed rows back off via available_at.
 */
export async function claimUnpublishedOutboxEvents(
  limit = 50,
): Promise<ClaimedOutboxEvent[]> {
  const lockToken = randomUUID();
  const staleBefore = new Date(Date.now() - LOCK_STALE_MS);

  const rows = await prisma.$queryRaw<
    Array<{
      id: string;
      organization_id: string;
      event_type: string;
      payload: Prisma.JsonValue;
      actor_user_id: string | null;
      correlation_id: string | null;
      created_at: Date;
      attempts: number;
      lock_token: string;
    }>
  >`
    WITH candidates AS (
      SELECT id
      FROM outbox_events
      WHERE published_at IS NULL
        AND attempts < ${MAX_ATTEMPTS}
        AND (available_at IS NULL OR available_at <= NOW())
        AND (locked_at IS NULL OR locked_at < ${staleBefore})
      ORDER BY created_at ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE outbox_events AS o
    SET
      locked_at = NOW(),
      lock_token = ${lockToken},
      attempts = o.attempts + 1
    FROM candidates
    WHERE o.id = candidates.id
    RETURNING
      o.id,
      o.organization_id,
      o.event_type,
      o.payload,
      o.actor_user_id,
      o.correlation_id,
      o.created_at,
      o.attempts,
      o.lock_token
  `;

  return rows.map((row) => ({
    id: row.id,
    organizationId: row.organization_id,
    eventType: row.event_type,
    payload: row.payload,
    actorUserId: row.actor_user_id,
    correlationId: row.correlation_id,
    createdAt: row.created_at,
    attempts: row.attempts,
    lockToken: row.lock_token,
  }));
}

export async function markOutboxPublished(
  ids: string[],
  lockToken?: string,
): Promise<void> {
  if (ids.length === 0) return;
  await prisma.outboxEvent.updateMany({
    where: {
      id: { in: ids },
      ...(lockToken ? { lockToken } : {}),
    },
    data: {
      publishedAt: new Date(),
      lockedAt: null,
      lockToken: null,
      lastError: null,
      availableAt: null,
    },
  });
}

export async function markOutboxFailed(
  id: string,
  lockToken: string,
  errorMessage: string,
  attempts: number,
): Promise<void> {
  const backoffSeconds = Math.min(300, 2 ** Math.min(attempts, 8));
  const availableAt = new Date(Date.now() + backoffSeconds * 1000);

  await prisma.outboxEvent.updateMany({
    where: { id, lockToken },
    data: {
      lockedAt: null,
      lockToken: null,
      lastError: errorMessage.slice(0, 2000),
      availableAt,
    },
  });
}

export { MAX_ATTEMPTS as OUTBOX_MAX_ATTEMPTS };
