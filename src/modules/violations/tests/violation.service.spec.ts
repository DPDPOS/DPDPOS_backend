import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";

import { prisma } from "../../../infrastructure/database/prisma-client.js";
import {
  connectRedis,
  disconnectRedis,
} from "../../../infrastructure/cache/redis-client.js";
import { DOMAIN_EVENTS } from "../../../events/types/base-event.interface.js";
import type { RequestContext } from "../../../shared/types/request-context.js";

import { ValidationRunService } from "../../validations/services/validation-run.service.js";
import { ValidationExecutionService } from "../../validations/services/validation-execution.service.js";

import { ViolationService } from "../services/violation.service.js";

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

describe("Violations module (VIO-004)", () => {
  const service = new ViolationService();
  const runsService = new ValidationRunService();
  const executionService = new ValidationExecutionService();

  const createdOrgIds: string[] = [];
  const createdViolationIds: string[] = [];
  const createdRunIds: string[] = [];
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

  async function runFailingValidation(
    orgId: string,
  ): Promise<{ runId: string; resultId: string; ruleId: string }> {
    // A fresh org has no notice → notice-present FAILS.
    const ctx = makeContext(orgId);
    const run = await runsService.trigger(ctx, {});
    createdRunIds.push(run.id);
    await executionService.executeRun(run.id);

    const result = await prisma.validationResult.findFirst({
      where: { runId: run.id, ruleCode: "notice-present" },
    });
    expect(result).not.toBeNull();
    return {
      runId: run.id,
      resultId: result!.id,
      ruleId: result!.ruleId,
    };
  }

  it("creates a violation manually and writes a ViolationCreated outbox event", async () => {
    const orgId = await createOrg(`VIO-004 Create Org ${Date.now()}`);
    const ctx = makeContext(orgId);

    const violation = await service.create(ctx, {
      severity: "HIGH",
      title: "Untracked personal data transfer",
      description: "Processor without agreement.",
    });
    createdViolationIds.push(violation.id);

    expect(violation.id).toBeTruthy();
    expect(violation.status).toBe("OPEN");
    expect(violation.version).toBe(1);
    expect(violation.severity).toBe("HIGH");

    const outbox = await prisma.outboxEvent.findFirst({
      where: {
        organizationId: orgId,
        eventType: DOMAIN_EVENTS.ViolationCreated,
      },
    });
    expect(outbox).not.toBeNull();
    expect(outbox?.publishedAt).toBeNull();
  });

  it("walks the full violation lifecycle with the state machine", async () => {
    const orgId = await createOrg(`VIO-004 Lifecycle Org ${Date.now()}`);
    const ctx = makeContext(orgId);
    const assigneeId = await createUser(orgId, "ViolationOwner");

    const violation = await service.create(ctx, {
      severity: "MEDIUM",
      title: "Retention gap",
    });
    createdViolationIds.push(violation.id);

    const triaged = await service.update(ctx, violation.id, {
      version: 1,
      status: "TRIAGE",
    });
    const assigned = await service.update(ctx, violation.id, {
      version: triaged.version,
      status: "ASSIGNED",
      assignedTo: assigneeId,
    });
    const inProgress = await service.update(ctx, violation.id, {
      version: assigned.version,
      status: "IN_PROGRESS",
    });
    const pendingEvidence = await service.update(ctx, violation.id, {
      version: inProgress.version,
      status: "PENDING_EVIDENCE",
    });
    const validated = await service.update(ctx, violation.id, {
      version: pendingEvidence.version,
      status: "VALIDATED",
    });
    const closed = await service.close(ctx, violation.id, {
      version: validated.version,
      resolutionSummary: "Retention policy published and assets tagged.",
    });

    expect(closed.status).toBe("CLOSED");
    expect(closed.closedAt).not.toBeNull();
    expect(closed.version).toBe(7);

    const closedOutbox = await prisma.outboxEvent.findFirst({
      where: {
        organizationId: orgId,
        eventType: DOMAIN_EVENTS.ViolationClosed,
      },
    });
    expect(closedOutbox).not.toBeNull();
  });

  it("opens a violation from a ValidationFailed event (the key workflow)", async () => {
    const orgId = await createOrg(`VIO-004 Event Org ${Date.now()}`);
    const ctx = makeContext(orgId);

    const { runId, resultId, ruleId } = await runFailingValidation(orgId);

    const violation = await service.createFromValidationFailed(ctx, {
      runId,
      ruleId,
      resultId,
      ruleCode: "notice-present",
      severity: "MEDIUM",
      evidenceRequiredFlag: true,
      explanation: "No privacy notice has been published.",
    });

    expect(violation).not.toBeNull();
    expect(violation!.validationResultId).toBe(resultId);
    expect(violation!.severity).toBe("MEDIUM");
    expect(violation!.status).toBe("OPEN");
    expect(violation!.title).toContain("Validation failed");
    createdViolationIds.push(violation!.id);

    // Event → ViolationCreated outbox written.
    const outbox = await prisma.outboxEvent.findFirst({
      where: {
        organizationId: orgId,
        eventType: DOMAIN_EVENTS.ViolationCreated,
      },
    });
    expect(outbox).not.toBeNull();
  });

  it("is idempotent for the same validation result (no duplicate violation)", async () => {
    const orgId = await createOrg(`VIO-004 Dedupe Org ${Date.now()}`);
    const ctx = makeContext(orgId);

    const { runId, resultId, ruleId } = await runFailingValidation(orgId);
    const payload = {
      runId,
      ruleId,
      resultId,
      ruleCode: "notice-present",
      severity: "MEDIUM",
    };

    const first = await service.createFromValidationFailed(ctx, payload);
    createdViolationIds.push(first!.id);

    // Re-delivery of the same event must not create a second violation.
    const again = await service.createFromValidationFailed(ctx, payload);
    expect(again!.id).toBe(first!.id);

    const count = await prisma.violation.count({
      where: { organizationId: orgId },
    });
    expect(count).toBe(1);
  });

  it("rejects closing a non-validated violation", async () => {
    const orgId = await createOrg(`VIO-004 No-close Org ${Date.now()}`);
    const ctx = makeContext(orgId);

    const violation = await service.create(ctx, {
      severity: "LOW",
      title: "Open item",
    });
    createdViolationIds.push(violation.id);

    await expect(
      service.close(ctx, violation.id, {
        version: 1,
        resolutionSummary: "Attempt to close early.",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("rejects illegal transitions with a conflict", async () => {
    const orgId = await createOrg(`VIO-004 Illegal Org ${Date.now()}`);
    const ctx = makeContext(orgId);

    const violation = await service.create(ctx, {
      severity: "HIGH",
      title: "Illegal jump",
    });
    createdViolationIds.push(violation.id);

    // OPEN → IN_PROGRESS skips the intermediate states.
    await expect(
      service.update(ctx, violation.id, {
        version: 1,
        status: "IN_PROGRESS",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("rejects updates and re-closes on terminal violations", async () => {
    const orgId = await createOrg(`VIO-004 Terminal Org ${Date.now()}`);
    const ctx = makeContext(orgId);

    const violation = await service.create(ctx, {
      severity: "LOW",
      title: "Archive me",
    });
    createdViolationIds.push(violation.id);

    const archived = await service.update(ctx, violation.id, {
      version: 1,
      status: "ARCHIVED",
    });
    expect(archived.status).toBe("ARCHIVED");

    await expect(
      service.update(ctx, violation.id, {
        version: archived.version,
        status: "OPEN",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("rejects stale version updates (optimistic locking)", async () => {
    const orgId = await createOrg(`VIO-004 Version Org ${Date.now()}`);
    const ctx = makeContext(orgId);

    const violation = await service.create(ctx, {
      severity: "MEDIUM",
      title: "Version race",
    });
    createdViolationIds.push(violation.id);

    await service.update(ctx, violation.id, {
      version: 1,
      status: "TRIAGE",
    });

    await expect(
      service.update(ctx, violation.id, {
        version: 1,
        status: "ASSIGNED",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("rejects assignees from another organization", async () => {
    const orgId = await createOrg(`VIO-004 Tenant A ${Date.now()}`);
    const ctx = makeContext(orgId);

    const otherOrgId = await createOrg(`VIO-004 Tenant B ${Date.now()}`);
    const foreignUser = await createUser(otherOrgId, "ForeignOwner");

    await expect(
      service.create(ctx, {
        severity: "HIGH",
        title: "Cross-tenant assignment",
        assignedTo: foreignUser,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("lists and filters violations", async () => {
    const orgId = await createOrg(`VIO-004 List Org ${Date.now()}`);
    const ctx = makeContext(orgId);

    const first = await service.create(ctx, {
      severity: "HIGH",
      title: "List item one",
    });
    const second = await service.create(ctx, {
      severity: "LOW",
      title: "List item two",
    });
    createdViolationIds.push(first.id, second.id);

    const all = await service.list(ctx);
    expect(all.some((v) => v.id === first.id)).toBe(true);
    expect(all.some((v) => v.id === second.id)).toBe(true);

    const high = await service.list(ctx, { severity: "HIGH" });
    expect(high.every((v) => v.severity === "HIGH")).toBe(true);

    const open = await service.list(ctx, { status: "OPEN" });
    expect(open.every((v) => v.status === "OPEN")).toBe(true);
  });

  it("throws NOT_FOUND for unknown ids", async () => {
    const orgId = await createOrg(`VIO-004 Missing Org ${Date.now()}`);
    const ctx = makeContext(orgId);
    const missingId = randomUUID();

    await expect(service.getById(ctx, missingId)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(
      service.update(ctx, missingId, { version: 1, status: "TRIAGE" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      service.close(ctx, missingId, {
        version: 1,
        resolutionSummary: "n/a",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
