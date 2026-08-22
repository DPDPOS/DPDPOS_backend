import { describe, expect, it } from "vitest";
import { PERMISSIONS, ALL_PERMISSIONS } from "../../src/shared/constants/permissions.js";
import { DOMAIN_EVENTS } from "../../src/events/types/base-event.interface.js";

describe("phase0 contracts", () => {
  it("exposes resource:action permission strings", () => {
    expect(PERMISSIONS.ORGANIZATION_CREATE).toBe("organization:create");
    expect(ALL_PERMISSIONS.length).toBeGreaterThan(10);
  });

  it("freezes core domain event names", () => {
    expect(DOMAIN_EVENTS.OrganizationCreated).toBe("OrganizationCreated");
    expect(DOMAIN_EVENTS.FrameworkPublished).toBe("FrameworkPublished");
  });
});
