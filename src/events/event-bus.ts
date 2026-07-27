import { Queue } from "bullmq";
import { createBullMqConnectionOptions } from "../infrastructure/queue/bullmq-connection.js";
import { logger } from "../infrastructure/logging/logger.js";
import type { BaseDomainEvent } from "./types/base-event.interface.js";

export const EVENT_BUS_QUEUE_NAME = "event-bus";

let eventBusQueue: Queue | null = null;

export function getEventBusQueue(): Queue {
  if (!eventBusQueue) {
    eventBusQueue = new Queue(EVENT_BUS_QUEUE_NAME, {
      connection: createBullMqConnectionOptions(),
    });
  }
  return eventBusQueue;
}

export async function publishDomainEvent(event: BaseDomainEvent): Promise<void> {
  const queue = getEventBusQueue();
  await queue.add(event.eventType, event, {
    jobId: event.eventId,
    removeOnComplete: 1000,
    removeOnFail: 5000,
  });
  logger.debug(
    { eventId: event.eventId, eventType: event.eventType },
    "event.published",
  );
}
