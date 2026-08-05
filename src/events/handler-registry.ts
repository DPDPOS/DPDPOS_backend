import type { BaseDomainEvent } from "./types/base-event.interface.js";

export type DomainEventHandler = (
  event: BaseDomainEvent,
) => Promise<void>;

const handlers = new Map<string, DomainEventHandler>();

/** Registers a handler for an event type. Consuming modules call this at boot. */
export function registerEventHandler(
  eventType: string,
  handler: DomainEventHandler,
): void {
  handlers.set(eventType, handler);
}

export function resolveEventHandler(
  eventType: string,
): DomainEventHandler | undefined {
  return handlers.get(eventType);
}

export function registeredEventTypes(): string[] {
  return [...handlers.keys()];
}
