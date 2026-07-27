import { appConfig } from "../../config/app.config.js";
import { logger } from "../../infrastructure/logging/logger.js";
import { publishDomainEvent } from "../event-bus.js";
import type { BaseDomainEvent, DomainEventName } from "../types/base-event.interface.js";
import {
  claimUnpublishedOutboxEvents,
  markOutboxPublished,
} from "./outbox.repository.js";

let timer: NodeJS.Timeout | null = null;
let running = false;

async function relayOnce(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const rows = await claimUnpublishedOutboxEvents(50);
    if (rows.length === 0) return;

    const publishedIds: string[] = [];
    for (const row of rows) {
      const event: BaseDomainEvent = {
        eventId: row.id,
        eventType: row.eventType as DomainEventName,
        organizationId: row.organizationId,
        occurredAt: row.createdAt.toISOString(),
        actorUserId: row.actorUserId ?? undefined,
        correlationId: row.correlationId ?? undefined,
        payload: (row.payload as Record<string, unknown>) ?? {},
      };
      await publishDomainEvent(event);
      publishedIds.push(row.id);
    }

    await markOutboxPublished(publishedIds);
    logger.info({ count: publishedIds.length }, "outbox.relayed");
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
