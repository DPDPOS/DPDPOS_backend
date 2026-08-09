import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";

import { prisma } from "../../../infrastructure/database/prisma-client.js";
import {
  connectRedis,
  disconnectRedis,
} from "../../../infrastructure/cache/redis-client.js";
import { DOMAIN_EVENTS } from "../../../events/types/base-event.interface.js";
import type { RequestContext } from "../../../shared/types/request-context.js";

import { RemediationTaskService } from "../services/remediation-task.service.js";

import { deleteTestOrganizations } from "../../../test-utils/cleanup-organizations.js";

function makeContext(organizationId: string): RequestContext {
  return {
    correlationId: randomUUID(),
    organizationId,
    actorUserId: randomUUID(),
    permissions: [],
    roles: [],
  };
}

describe("Remediation module (REM-005)", () => {
  const service = new RemediationTaskService();

  const createdOrgIds: string[] = [];
  const createdTaskIds: string[] = [];
  const createdViolationIds: string[] = [];
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    await prisma.$connect();
    await connectRedis();
  });

  afterAll(async () => {
    await deleteTestOrganizations(createdOrgIds);
    await disconnectRedis();
    await prisma.$disconnect();
  });

  async function createOrg(name: string): Promise<string> {
    const org = await prisma.organization.create({ data: { name } });
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

  async function createViolation(
    organizationId: string,
    title = "Test violation",
  ): Promise<string> {
    const violation = await prisma.violation.create({
      data: {
        organizationId,
        severity: "HIGH",
        title,
        status: "OPEN",
      },
    });
    createdViolationIds.push(violation.id);
    return violation.id;
  }

  it("creates a manual task linked to a violation and writes a RemediationTaskAssigned outbox event", async () => {
    const orgId = await createOrg(`REM-005 Create Org ${Date.now()}`);
    const ctx = makeContext(orgId);
    const assigneeId = await createUser(orgId, "RemediationOwner");
    const violationId = await createViolation(orgId, "Manual link");

    const task = await service.create(ctx, {
      violationId,
      taskTitle: "Publish the privacy notice",
      taskDescription: "Draft, review, publish.",
      assignedTo: assigneeId,
      dueAt: "2026-09-01T00:00:00.000Z",
    });
    createdTaskIds.push(task.id);

    expect(task.id).toBeTruthy();
    expect(task.violationId).toBe(violationId);
    expect(task.status).toBe("PENDING");
    expect(task.source).toBe("MANUAL");
    expect(task.assignedTo).toBe(assigneeId);
    expect(task.version).toBe(1);

    const outbox = await prisma.outboxEvent.findFirst({
      where: {
        organizationId: orgId,
        eventType: DOMAIN_EVENTS.RemediationTaskAssigned,
      },
    });
    expect(outbox).not.toBeNull();
    expect(outbox?.publishedAt).toBeNull();
  });

  it("auto-creates a PENDING task from a ViolationCreated event", async () => {
    const orgId = await createOrg(`REM-005 Event Org ${Date.now()}`);
    const ctx = makeContext(orgId);
    const violationId = await createViolation(orgId, "Event-sourced violation");

    const task = await service.createFromViolationCreated(ctx, {
      violationId,
      severity: "HIGH",
      title: "Notice is missing",
    });
    createdTaskIds.push(task!.id);

    expect(task).not.toBeNull();
    expect(task!.source).toBe("AUTO");
    expect(task!.status).toBe("PENDING");
    expect(task!.assignedTo).toBeNull();
    expect(task!.taskTitle).toContain("Notice is missing");
  });

  it("is idempotent for the same violation (no duplicate AUTO task)", async () => {
    const orgId = await createOrg(`REM-005 Dedupe Org ${Date.now()}`);
    const ctx = makeContext(orgId);
    const violationId = await createViolation(orgId, "Dedupe violation");

    const payload = {
      violationId,
      severity: "MEDIUM",
      title: "Dedupe me",
    };

    const first = await service.createFromViolationCreated(ctx, payload);
    createdTaskIds.push(first!.id);

    // Re-delivery of the same event must not create a second task.
    const again = await service.createFromViolationCreated(ctx, payload);
    expect(again!.id).toBe(first!.id);

    const count = await prisma.remediationTask.count({
      where: { organizationId: orgId },
    });
    expect(count).toBe(1);
  });

  it("walks the full remediation lifecycle with the state machine", async () => {
    const orgId = await createOrg(`REM-005 Lifecycle Org ${Date.now()}`);
    const ctx = makeContext(orgId);
    const assigneeId = await createUser(orgId, "LifecycleOwner");
    const violationId = await createViolation(orgId, "Lifecycle violation");

    const task = await service.create(ctx, {
      violationId,
      taskTitle: "Fix retention gap",
      assignedTo: assigneeId,
    });
    createdTaskIds.push(task.id);

    const started = await service.update(ctx, task.id, {
      version: task.version,
      status: "IN_PROGRESS",
    });
    const submitted = await service.update(ctx, task.id, {
      version: started.version,
      status: "PENDING_VERIFICATION",
      verificationNotes: "Fix applied, waiting for review.",
    });
    const verified = await service.update(ctx, task.id, {
      version: submitted.version,
      status: "VERIFIED",
      verificationNotes: "Reviewed — retention policy updated.",
    });

    expect(verified.status).toBe("VERIFIED");
    expect(verified.verifiedAt).not.toBeNull();
    expect(verified.verifiedBy).toBe(ctx.actorUserId);

    const closed = await service.close(ctx, task.id, {
      version: verified.version,
      resolutionSummary: "Retention policy updated and assets tagged.",
    });

    expect(closed.status).toBe("CLOSED");
    expect(closed.closedAt).not.toBeNull();
    expect(closed.version).toBe(5);

    const completedOutbox = await prisma.outboxEvent.findFirst({
      where: {
        organizationId: orgId,
        eventType: DOMAIN_EVENTS.RemediationCompleted,
      },
    });
    expect(completedOutbox).not.toBeNull();
  });

  it("publishes RemediationTaskAssigned when a task is reassigned", async () => {
    const orgId = await createOrg(`REM-005 Reassign Org ${Date.now()}`);
    const ctx = makeContext(orgId);
    const firstOwner = await createUser(orgId, "FirstOwner");
    const secondOwner = await createUser(orgId, "SecondOwner");
    const violationId = await createViolation(orgId, "Reassign violation");

    const task = await service.create(ctx, {
      violationId,
      taskTitle: "Hand over task",
      assignedTo: firstOwner,
    });
    createdTaskIds.push(task.id);

    const reassigned = await service.update(ctx, task.id, {
      version: task.version,
      assignedTo: secondOwner,
    });
    expect(reassigned.assignedTo).toBe(secondOwner);

    const assignedOutbox = await prisma.outboxEvent.findMany({
      where: {
        organizationId: orgId,
        eventType: DOMAIN_EVENTS.RemediationTaskAssigned,
      },
      orderBy: { createdAt: "asc" },
    });
    expect(assignedOutbox.length).toBe(2);
  });

  it("rejects closing a non-verified task", async () => {
    const orgId = await createOrg(`REM-005 No-close Org ${Date.now()}`);
    const ctx = makeContext(orgId);
    const violationId = await createViolation(orgId, "No-close violation");

    const task = await service.create(ctx, {
      violationId,
      taskTitle: "Not verified yet",
    });
    createdTaskIds.push(task.id);

    await expect(
      service.close(ctx, task.id, {
        version: 1,
        resolutionSummary: "Attempt to close early.",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("rejects illegal transitions with a conflict", async () => {
    const orgId = await createOrg(`REM-005 Illegal Org ${Date.now()}`);
    const ctx = makeContext(orgId);
    const violationId = await createViolation(orgId, "Illegal violation");

    const task = await service.create(ctx, {
      violationId,
      taskTitle: "Illegal jump",
    });
    createdTaskIds.push(task.id);

    // PENDING → VERIFIED skips the intermediate states.
    await expect(
      service.update(ctx, task.id, {
        version: 1,
        status: "VERIFIED",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("rejects updates on terminal tasks", async () => {
    const orgId = await createOrg(`REM-005 Terminal Org ${Date.now()}`);
    const ctx = makeContext(orgId);
    const violationId = await createViolation(orgId, "Terminal violation");

    const task = await service.create(ctx, {
      violationId,
      taskTitle: "Cancel me",
    });
    createdTaskIds.push(task.id);

    const cancelled = await service.update(ctx, task.id, {
      version: 1,
      status: "CANCELLED",
    });
    expect(cancelled.status).toBe("CANCELLED");

    await expect(
      service.update(ctx, task.id, {
        version: cancelled.version,
        status: "IN_PROGRESS",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("rejects stale version updates (optimistic locking)", async () => {
    const orgId = await createOrg(`REM-005 Version Org ${Date.now()}`);
    const ctx = makeContext(orgId);
    const violationId = await createViolation(orgId, "Version violation");

    const task = await service.create(ctx, {
      violationId,
      taskTitle: "Version race",
    });
    createdTaskIds.push(task.id);

    await service.update(ctx, task.id, {
      version: 1,
      status: "IN_PROGRESS",
    });

    await expect(
      service.update(ctx, task.id, {
        version: 1,
        status: "PENDING_VERIFICATION",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("rejects assignees from another organization", async () => {
    const orgId = await createOrg(`REM-005 Tenant A ${Date.now()}`);
    const ctx = makeContext(orgId);
    const violationId = await createViolation(orgId, "Tenant A violation");

    const otherOrgId = await createOrg(`REM-005 Tenant B ${Date.now()}`);
    const foreignUser = await createUser(otherOrgId, "ForeignOwner");

    await expect(
      service.create(ctx, {
        violationId,
        taskTitle: "Cross-tenant assignment",
        assignedTo: foreignUser,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects violations from another organization", async () => {
    const orgId = await createOrg(`REM-005 Tenant C ${Date.now()}`);
    const ctx = makeContext(orgId);

    const otherOrgId = await createOrg(`REM-005 Tenant D ${Date.now()}`);
    const foreignViolationId = await createViolation(
      otherOrgId,
      "Tenant D violation",
    );

    await expect(
      service.create(ctx, {
        violationId: foreignViolationId,
        taskTitle: "Cross-tenant link",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("lists and filters tasks", async () => {
    const orgId = await createOrg(`REM-005 List Org ${Date.now()}`);
    const ctx = makeContext(orgId);
    const violationId = await createViolation(orgId, "List violation");
    const assigneeId = await createUser(orgId, "ListOwner");

    const first = await service.create(ctx, {
      violationId,
      taskTitle: "List item one",
      assignedTo: assigneeId,
    });
    const second = await service.create(ctx, {
      violationId,
      taskTitle: "List item two",
    });
    createdTaskIds.push(first.id, second.id);

    const all = await service.list(ctx);
    expect(all.some((t) => t.id === first.id)).toBe(true);
    expect(all.some((t) => t.id === second.id)).toBe(true);

    const pending = await service.list(ctx, { status: "PENDING" });
    expect(pending.every((t) => t.status === "PENDING")).toBe(true);

    const mine = await service.list(ctx, { assignedTo: assigneeId });
    expect(mine.every((t) => t.assignedTo === assigneeId)).toBe(true);

    const byViolation = await service.list(ctx, { violationId });
    expect(byViolation.every((t) => t.violationId === violationId)).toBe(true);
  });

  it("throws NOT_FOUND for unknown ids", async () => {
    const orgId = await createOrg(`REM-005 Missing Org ${Date.now()}`);
    const ctx = makeContext(orgId);
    const missingId = randomUUID();

    await expect(service.getById(ctx, missingId)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(
      service.update(ctx, missingId, { version: 1, status: "IN_PROGRESS" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      service.close(ctx, missingId, {
        version: 1,
        resolutionSummary: "n/a",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
