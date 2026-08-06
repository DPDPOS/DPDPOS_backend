import { Worker } from "bullmq";

import { createBullMqConnectionOptions } from "../infrastructure/queue/bullmq-connection.js";
import { logger } from "../infrastructure/logging/logger.js";
import { EVENT_BUS_QUEUE_NAME } from "./event-bus.js";
import { resolveEventHandler } from "./handler-registry.js";
import type { BaseDomainEvent } from "./types/base-event.interface.js";

let worker: Worker<BaseDomainEvent> | null = null;

/**
 * Consumes the BullMQ event-bus queue and dispatches each event to its
 * registered handler (in the consuming module). Idempotency is provided by
 * the publisher (jobId = eventId) plus handler-level dedupe — at-least-once
 * delivery is safe.
 *
 * This is the first event subscriber in the codebase; the outbox relay had no
 * consumer until the violations module registered its first handler.
 */
export function startEventBusWorker(): void {
  if (worker) return;

  worker = new Worker<BaseDomainEvent>(
    EVENT_BUS_QUEUE_NAME,
    async (job) => {
      const event = job.data;
      const handler = resolveEventHandler(event.eventType);

      if (!handler) {
        logger.debug(
          { eventType: event.eventType, eventId: event.eventId },
          "event.no_handler",
        );
        return;
      }

      await handler(event);
    },
    {
      connection: createBullMqConnectionOptions(),
      concurrency: 10,
    },
  );

  worker.on("completed", (job) => {
    logger.debug(
      { jobId: job.id, eventType: job.name },
      "event.handler_completed",
    );
  });
  worker.on("failed", (job, err) => {
    logger.error(
      { jobId: job?.id, eventType: job?.name, err },
      "event.handler_failed",
    );
  });

  logger.info("event.bus_worker_started");
}

export function stopEventBusWorker(): Promise<void> {
  if (!worker) return Promise.resolve();
  const w = worker;
  worker = null;
  return w.close();
}
