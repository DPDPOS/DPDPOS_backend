import { describe, expect, it, vi } from "vitest";

import { DOMAIN_EVENTS } from "../../src/events/types/base-event.interface.js";
import {
  registerEventHandler,
  resolveEventHandler,
  registeredEventTypes,
  type DomainEventHandler,
} from "../../src/events/handler-registry.js";
import { registerEventSubscribers } from "../../src/bootstrap/register-events.js";

const sampleEvent = {
  eventId: "3f0c8f26-8e26-4d5f-9b4e-2c8f4a7e0d11",
  eventType: DOMAIN_EVENTS.ValidationFailed,
  organizationId: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  occurredAt: new Date().toISOString(),
  payload: {},
} as const;

describe("event handler registry", () => {
  it("resolves undefined for unregistered event types (worker no-op path)", () => {
    // Only ValidationFailed has a subscriber today — every other event type
    // must resolve to no handler so the event-bus worker logs-and-acks rather
    // than retry-looping on events without consumers.
    expect(resolveEventHandler("ValidationCompleted")).toBeUndefined();
    expect(resolveEventHandler("ViolationCreated")).toBeUndefined();
    expect(resolveEventHandler("totally-unknown-event")).toBeUndefined();
  });

  it("dispatches to a registered handler", async () => {
    const handler = vi.fn<DomainEventHandler>(async () => {});
    registerEventHandler("test.type", handler);

    const resolved = resolveEventHandler("test.type");
    expect(resolved).toBeTypeOf("function");

    await resolved!(sampleEvent as never);
    expect(handler).toHaveBeenCalledWith(sampleEvent);
  });

  it("boot wiring registers the ValidationFailed subscriber", () => {
    registerEventSubscribers();

    expect(registeredEventTypes()).toContain(DOMAIN_EVENTS.ValidationFailed);
    expect(resolveEventHandler(DOMAIN_EVENTS.ValidationFailed)).toBeTypeOf(
      "function",
    );
  });
});
