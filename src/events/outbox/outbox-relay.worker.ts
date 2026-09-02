import { appConfig } from "../../config/app.config.js";
import { logger } from "../../infrastructure/logging/logger.js";
import { publishDomainEvent } from "../event-bus.js";
import type { BaseDomainEvent, DomainEventName } from "../types/base-event.interface.js";
import {
  claimUnpublishedOutboxEvents,
  markOutboxFailed,
  markOutboxPublished,
} from "./outbox.repository.js";

let timer: NodeJS.Timeout | null = null;
let running = false;

async function relayOnce(options?: { organizationId?: string }): Promise<void> {
  if (running) return;
  running = true;
  try {
    const rows = await claimUnpublishedOutboxEvents(50, options);
    if (rows.length === 0) return;

    let published = 0;
    let failed = 0;

    for (const row of rows) {
      try {
        const rawPayload = (row.payload as Record<string, unknown>) ?? {};
        const client = (rawPayload.__client as
          | { ipAddress?: string; userAgent?: string }
          | undefined) ?? undefined;
        const { __client: _omit, ...payload } = rawPayload;
        const event: BaseDomainEvent = {
          eventId: row.id,
          eventType: row.eventType as DomainEventName,
          organizationId: row.organizationId,
          occurredAt: row.createdAt.toISOString(),
          actorUserId: row.actorUserId ?? undefined,
          correlationId: row.correlationId ?? undefined,
          payload,
          ipAddress: client?.ipAddress,
          userAgent: client?.userAgent,
        };
        await publishDomainEvent(event);
        await markOutboxPublished([row.id], row.lockToken);
        published += 1;
      } catch (err) {
        failed += 1;
        const message = err instanceof Error ? err.message : String(err);
        await markOutboxFailed(row.id, row.lockToken, message, row.attempts);
        logger.error(
          { err, eventId: row.id, attempts: row.attempts },
          "outbox.relay_item_failed",
        );
      }
    }

    logger.info({ published, failed }, "outbox.relayed");
  } catch (err) {
    logger.error({ err }, "outbox.relay_failed");
  } finally {
    running = false;
  }
}

export function startOutboxRelay(): void {
  if (timer) return;
  timer = setInterval(() => {
    void relayOnce();
  }, appConfig.outboxPollIntervalMs);
  logger.info(
    { intervalMs: appConfig.outboxPollIntervalMs },
    "outbox.relay_started",
  );
}

export function stopOutboxRelay(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
    logger.info("outbox.relay_stopped");
  }
}

/** Exported for tests — one relay tick, optionally scoped to one org. */
export async function relayOutboxOnceForTests(options?: {
  organizationId?: string;
}): Promise<void> {
  await relayOnce(options);
}
