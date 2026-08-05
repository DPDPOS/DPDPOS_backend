import type { BaseDomainEvent } from "./types/base-event.interface.js";

export type DomainEventHandler = (
  event: BaseDomainEvent,
) => Promise<void>;

const handlers = new Map<string, DomainEventHandler[]>();

/** Registers a handler for an event type. Consuming modules call this at boot. */
export function registerEventHandler(
  eventType: string,
  handler: DomainEventHandler,
): void {
  const registered = handlers.get(eventType) ?? [];
  registered.push(handler);
  handlers.set(eventType, registered);
}

export function resolveEventHandler(
  eventType: string,
): DomainEventHandler | undefined {
  const registered = handlers.get(eventType);
  if (!registered?.length) return undefined;
  return async (event) => {
    await Promise.all(registered.map((handler) => handler(event)));
  };
}

export function registeredEventTypes(): string[] {
  return [...handlers.keys()];
}
