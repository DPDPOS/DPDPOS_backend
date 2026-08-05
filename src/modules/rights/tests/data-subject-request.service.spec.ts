import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";

import { prisma } from "../../../infrastructure/database/prisma-client.js";
import { DOMAIN_EVENTS } from "../../../events/types/base-event.interface.js";
import type { RequestContext } from "../../../shared/types/request-context.js";

import { DataSubjectRequestService } from "../services/data-subject-request.service.js";

function makeContext(organizationId: string): RequestContext {
  return {
    correlationId: randomUUID(),
    organizationId,
    actorUserId: randomUUID(),
    permissions: [],
    roles: [],
  };
}

describe("Rights module (RGT-002)", () => {
  const service = new DataSubjectRequestService();

  const createdOrgIds: string[] = [];
  const createdRequestIds: string[] = [];
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    if (createdRequestIds.length > 0) {
      await prisma.dataSubjectRequest.deleteMany({
        where: { id: { in: createdRequestIds } },
      });
    }
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({
        where: { id: { in: createdUserIds } },
      });
    }
    if (createdOrgIds.length > 0) {
      await prisma.outboxEvent.deleteMany({
        where: { organizationId: { in: createdOrgIds } },
      });
      await prisma.organization.deleteMany({
        where: { id: { in: createdOrgIds } },
      });
    }
    await prisma.$disconnect();
  });

  async function createOrg(name: string): Promise<string> {
    const org = await prisma.organization.create({
      data: { name },
    });
    createdOrgIds.push(org.id);
    return org.id;
  }

  async function createUser(
    organizationId: string,
    name: string,
  ): Promise<string> {
    const user = await prisma.user.create({
      data: {
        organizationId,
        email: `${name.toLowerCase()}.${Date.now()}@example.com`,
        name,
      },
    });
    createdUserIds.push(user.id);
    return user.id;
  }

  it("submits a request with SLA due date and writes a RightsRequestSubmitted outbox event", async () => {
    const orgId = await createOrg(`RGT-002 Submit Org ${Date.now()}`);
    const ctx = makeContext(orgId);

    const request = await service.submit(ctx, {
      requestType: "ERASURE",
      requesterReference: "erasure-requester@example.com",
    });
    createdRequestIds.push(request.id);

    expect(request.id).toBeTruthy();
    expect(request.requestType).toBe("ERASURE");
    expect(request.status).toBe("SUBMITTED");
    expect(request.version).toBe(1);
    expect(request.openedAt).toBeTruthy();
    expect(request.dueAt).not.toBeNull();
    expect(request.closedAt).toBeNull();

    const outbox = await prisma.outboxEvent.findFirst({
      where: {
        organizationId: orgId,
        eventType: DOMAIN_EVENTS.RightsRequestSubmitted,
      },
    });
    expect(outbox).not.toBeNull();
    expect(outbox?.publishedAt).toBeNull();
    // PII is deliberately excluded from the event payload.
    const payload = outbox?.payload as Record<string, unknown>;
    expect(payload.requesterReference).toBeUndefined();
    expect(payload.requestType).toBe("ERASURE");
  });

  it("applies a grievance SLA of 45 days", async () => {
    const orgId = await createOrg(`RGT-002 Grievance Org ${Date.now()}`);
    const ctx = makeContext(orgId);

    const request = await service.submit(ctx, {
      requestType: "GRIEVANCE_REDRESSAL",
      requesterReference: "grievance@example.com",
    });
    createdRequestIds.push(request.id);

    const opened = new Date(request.openedAt).getTime();
    const due = new Date(request.dueAt!).getTime();
    const days = Math.round((due - opened) / (24 * 60 * 60 * 1000));
    expect(days).toBe(45);
  });

  it("assigns a request to a user of the same organization", async () => {
    const orgId = await createOrg(`RGT-002 Assign Org ${Date.now()}`);
    const ctx = makeContext(orgId);
    const assigneeId = await createUser(orgId, "Assignee");

    const request = await service.submit(ctx, {
      requestType: "ACCESS",
      requesterReference: "access@example.com",
    });
    createdRequestIds.push(request.id);

    const assigned = await service.update(ctx, request.id, {
      version: 1,
      status: "ASSIGNED",
      assignedTo: assigneeId,
    });

    expect(assigned.status).toBe("ASSIGNED");
    expect(assigned.assignedTo).toBe(assigneeId);
    expect(assigned.version).toBe(2);
  });

  it("walks the full lifecycle and writes a RightsRequestClosed outbox event", async () => {
    const orgId = await createOrg(`RGT-002 Lifecycle Org ${Date.now()}`);
    const ctx = makeContext(orgId);

    const request = await service.submit(ctx, {
      requestType: "CORRECTION",
      requesterReference: "correction@example.com",
    });
    createdRequestIds.push(request.id);

    const assigned = await service.update(ctx, request.id, {
      version: 1,
      status: "ASSIGNED",
    });
    const inProgress = await service.update(ctx, request.id, {
      version: assigned.version,
      status: "IN_PROGRESS",
    });
    const responded = await service.update(ctx, request.id, {
      version: inProgress.version,
      status: "RESPONDED",
      resolutionSummary: "Correction applied to marketing database.",
    });
    const closed = await service.update(ctx, request.id, {
      version: responded.version,
      status: "CLOSED",
      resolutionSummary: "Correction applied to marketing database.",
    });

    expect(closed.status).toBe("CLOSED");
    expect(closed.closedAt).not.toBeNull();
    expect(closed.resolutionSummary).toContain("Correction applied");

    const outbox = await prisma.outboxEvent.findFirst({
      where: {
        organizationId: orgId,
        eventType: DOMAIN_EVENTS.RightsRequestClosed,
      },
    });
    expect(outbox).not.toBeNull();
    expect(outbox?.publishedAt).toBeNull();
  });

  it("rejects closing without a resolution summary", async () => {
    const orgId = await createOrg(`RGT-002 No-close Org ${Date.now()}`);
    const ctx = makeContext(orgId);

    const request = await service.submit(ctx, {
      requestType: "UPDATING",
      requesterReference: "updating@example.com",
    });
    createdRequestIds.push(request.id);

    const inProgress = await service.update(ctx, request.id, {
      version: 1,
      status: "IN_PROGRESS",
    });

    await expect(
      service.update(ctx, request.id, {
        version: inProgress.version,
        status: "CLOSED",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("rejects re-patching a closed request (terminal state is immutable)", async () => {
    const orgId = await createOrg(`RGT-002 Terminal Org ${Date.now()}`);
    const ctx = makeContext(orgId);

    const request = await service.submit(ctx, {
      requestType: "ACCESS",
      requesterReference: "terminal@example.com",
    });
    createdRequestIds.push(request.id);

    const assigned = await service.update(ctx, request.id, {
      version: 1,
      status: "ASSIGNED",
    });
    const inProgress = await service.update(ctx, request.id, {
      version: assigned.version,
      status: "IN_PROGRESS",
    });
    const responded = await service.update(ctx, request.id, {
      version: inProgress.version,
      status: "RESPONDED",
      resolutionSummary: "Resolved.",
    });
    const closed = await service.update(ctx, request.id, {
      version: responded.version,
      status: "CLOSED",
      resolutionSummary: "Resolved.",
    });

    // Re-patch with the current version + same status → 409, no rewrite.
    await expect(
      service.update(ctx, request.id, {
        version: closed.version,
        status: "CLOSED",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    const closedEvents = await prisma.outboxEvent.count({
      where: {
        organizationId: orgId,
        eventType: DOMAIN_EVENTS.RightsRequestClosed,
      },
    });
    expect(closedEvents).toBe(1);

    const persisted = await service.getById(ctx, request.id);
    expect(persisted.status).toBe("CLOSED");
    expect(persisted.closedAt).toBe(closed.closedAt);
    expect(persisted.version).toBe(closed.version);
  });

  it("rejects illegal transitions with a conflict", async () => {
    const orgId = await createOrg(`RGT-002 Illegal Org ${Date.now()}`);
    const ctx = makeContext(orgId);

    const request = await service.submit(ctx, {
      requestType: "NOMINATION",
      requesterReference: "nomination@example.com",
    });
    createdRequestIds.push(request.id);

    // SUBMITTED → RESPONDED skips the working states.
    await expect(
      service.update(ctx, request.id, {
        version: 1,
        status: "RESPONDED",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("rejects stale version updates with a conflict (optimistic locking)", async () => {
    const orgId = await createOrg(`RGT-002 Version Org ${Date.now()}`);
    const ctx = makeContext(orgId);

    const request = await service.submit(ctx, {
      requestType: "ACCESS",
      requesterReference: "version@example.com",
    });
    createdRequestIds.push(request.id);

    await service.update(ctx, request.id, {
      version: 1,
      status: "ASSIGNED",
    });

    // Same caller retries with the now-stale version 1 → 409.
    await expect(
      service.update(ctx, request.id, {
        version: 1,
        status: "IN_PROGRESS",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("rejects assignees from another organization", async () => {
    const orgId = await createOrg(`RGT-002 Tenant A ${Date.now()}`);
    const ctx = makeContext(orgId);

    const otherOrgId = await createOrg(`RGT-002 Tenant B ${Date.now()}`);
    const foreignUser = await createUser(otherOrgId, "ForeignUser");

    await expect(
      service.submit(ctx, {
        requestType: "ACCESS",
        requesterReference: "tenant-a@example.com",
        assignedTo: foreignUser,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("lists and filters requests", async () => {
    const orgId = await createOrg(`RGT-002 List Org ${Date.now()}`);
    const ctx = makeContext(orgId);

    const first = await service.submit(ctx, {
      requestType: "ACCESS",
      requesterReference: "list-1@example.com",
    });
    const second = await service.submit(ctx, {
      requestType: "ERASURE",
      requesterReference: "list-2@example.com",
    });
    createdRequestIds.push(first.id, second.id);

    const all = await service.list(ctx);
    expect(all.some((r) => r.id === first.id)).toBe(true);
    expect(all.some((r) => r.id === second.id)).toBe(true);

    const erasures = await service.list(ctx, {
      requestType: "ERASURE",
    });
    expect(erasures.length).toBeGreaterThanOrEqual(1);
    expect(erasures.every((r) => r.requestType === "ERASURE")).toBe(true);

    const submitted = await service.list(ctx, { status: "SUBMITTED" });
    expect(submitted.every((r) => r.status === "SUBMITTED")).toBe(true);
  });

  it("throws NOT_FOUND for unknown ids", async () => {
    const orgId = await createOrg(`RGT-002 Missing Org ${Date.now()}`);
    const ctx = makeContext(orgId);
    const missingId = randomUUID();

    await expect(service.getById(ctx, missingId)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(
      service.update(ctx, missingId, { version: 1, status: "ASSIGNED" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
