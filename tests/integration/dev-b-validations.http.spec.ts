import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import argon2 from "argon2";

import { createApp } from "../../src/app.js";
import { prisma } from "../../src/infrastructure/database/prisma-client.js";
import {
  connectRedis,
  disconnectRedis,
} from "../../src/infrastructure/cache/redis-client.js";
import { DOMAIN_EVENTS } from "../../src/events/types/base-event.interface.js";
import { validationExecutionService } from "../../src/modules/validations/services/validation-execution.service.js";
import { validationRunService } from "../../src/modules/validations/services/validation-run.service.js";

/**
 * Cross-module happy path for Developer B — Feature VLD-003:
 * org → login → list seeded rules → trigger run → execute (worker path) →
 * results + outbox events
 */
describe("Dev B validation engine end-to-end", () => {
  const app = createApp();
  const createdOrgIds: string[] = [];
  const password = "ChangeMe123!";
  const email = `vld003.admin.${Date.now()}@example.com`;

  let organizationId = "";
  let accessToken = "";

  beforeAll(async () => {
    await prisma.$connect();
    await connectRedis();
  });

  afterAll(async () => {
    if (createdOrgIds.length > 0) {
      await prisma.validationResult.deleteMany({
        where: { organizationId: { in: createdOrgIds } },
      });
      await prisma.validationRun.deleteMany({
        where: { organizationId: { in: createdOrgIds } },
      });
      await prisma.validationRule.deleteMany({
        where: { organizationId: { in: createdOrgIds } },
      });
      await prisma.outboxEvent.deleteMany({
        where: { organizationId: { in: createdOrgIds } },
      });
      await prisma.refreshSession.deleteMany({
        where: { organizationId: { in: createdOrgIds } },
      });
      await prisma.userRole.deleteMany({
        where: { organizationId: { in: createdOrgIds } },
      });
      await prisma.user.deleteMany({
        where: { organizationId: { in: createdOrgIds } },
      });
      await prisma.role.deleteMany({
        where: { organizationId: { in: createdOrgIds } },
      });
      await prisma.organization.deleteMany({
        where: { id: { in: createdOrgIds } },
      });
    }
    await disconnectRedis();
    await prisma.$disconnect();
  });

  function bearer(token = accessToken) {
    return `Bearer ${token}`;
  }

  it("runs a manual validation and surfaces results", async () => {
    // 1) Organization (seeds system roles)
    const orgRes = await request(app)
      .post("/api/v1/organizations")
      .send({
        name: `VLD-003 Fiduciary ${Date.now()}`,
        industry: "fintech",
        maturityLevel: "Developing",
      })
      .expect(201);

    organizationId = orgRes.body.data.organization.id as string;
    createdOrgIds.push(organizationId);

    // 2) Admin user (ORG_ADMIN) + login
    const adminRole = await prisma.role.findFirst({
      where: { organizationId, name: "ORG_ADMIN", deletedAt: null },
    });
    expect(adminRole).toBeTruthy();

    const user = await prisma.user.create({
      data: {
        organizationId,
        email,
        name: "VLD-003 Admin",
        passwordHash: await argon2.hash(password),
        status: "INVITED",
      },
    });
    await prisma.userRole.create({
      data: {
        organizationId,
        userId: user.id,
        roleId: adminRole!.id,
      },
    });

    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ organizationId, email, password })
      .expect(200);
    accessToken = login.body.data.tokens.accessToken as string;

    // 3) Seed rules for the org (idempotent), then list them
    const run = await validationRunService.trigger(
      {
        correlationId: "seed",
        organizationId,
        actorUserId: user.id,
        permissions: [],
        roles: [],
      },
      {},
    );
    await validationExecutionService.executeRun(run.id);
    await prisma.validationResult.deleteMany({ where: { runId: run.id } });
    await prisma.validationRun.delete({ where: { id: run.id } });

    const rules = await request(app)
      .get("/api/v1/validation-rules")
      .set("Authorization", bearer())
      .expect(200);

    expect(rules.body.data.length).toBe(5);
    const codes = rules.body.data.map((r: { ruleCode: string }) => r.ruleCode);
    expect(codes).toContain("notice-present");
    expect(codes).toContain("consent-present");

    // 4) Trigger a manual validation run (API enqueues; worker executes)
    const triggered = await request(app)
      .post("/api/v1/validation-runs")
      .set("Authorization", bearer())
      .send({})
      .expect(201);

    expect(triggered.body.data.triggerType).toBe("MANUAL");
    expect(triggered.body.data.status).toBe("PENDING");
    const runId = triggered.body.data.id as string;

    // 5) Execute via the worker path (same processor the queue invokes)
    await validationExecutionService.executeRun(runId);

    // 6) Run detail shows timing + results
    const detail = await request(app)
      .get(`/api/v1/validation-runs/${runId}`)
      .set("Authorization", bearer())
      .expect(200);

    expect(detail.body.data.status).toBe("COMPLETED");
    expect(detail.body.data.finishedAt).not.toBeNull();
    expect(detail.body.data.durationMs).not.toBeNull();
    expect(detail.body.data.results.length).toBe(5);

    const noticeResult = detail.body.data.results.find(
      (r: { ruleCode: string }) => r.ruleCode === "notice-present",
    );
    expect(noticeResult.resultStatus).toBe("FAIL");
    expect(noticeResult.evidenceRequiredFlag).toBe(true);

    // 7) List runs with status filter
    const list = await request(app)
      .get("/api/v1/validation-runs")
      .query({ status: "COMPLETED" })
      .set("Authorization", bearer())
      .expect(200);
    expect(
      list.body.data.some((r: { id: string }) => r.id === runId),
    ).toBe(true);

    // 8) Update a rule (optimistic lock) then verify the version bumps
    const rule = rules.body.data.find(
      (r: { ruleCode: string }) => r.ruleCode === "notice-present",
    );
    const updated = await request(app)
      .patch(`/api/v1/validation-rules/${rule.id}`)
      .set("Authorization", bearer())
      .send({ version: rule.version, activeFlag: false })
      .expect(200);
    expect(updated.body.data.activeFlag).toBe(false);
    expect(updated.body.data.version).toBe(rule.version + 1);

    // 9) Stale version → 409
    await request(app)
      .patch(`/api/v1/validation-rules/${rule.id}`)
      .set("Authorization", bearer())
      .send({ version: rule.version, severity: "CRITICAL" })
      .expect(409);

    // 10) Unknown rule code → 400
    await request(app)
      .post("/api/v1/validation-rules")
      .set("Authorization", bearer())
      .send({ ruleCode: "no-such-rule" })
      .expect(400);

    // 11) Unauthorized without token
    await request(app).get("/api/v1/validation-runs").expect(401);

    // 12) MEMBER role is denied validation endpoints
    const memberRole = await prisma.role.findFirst({
      where: { organizationId, name: "MEMBER", deletedAt: null },
    });
    expect(memberRole).toBeTruthy();

    const memberUser = await prisma.user.create({
      data: {
        organizationId,
        email: `vld003.member.${Date.now()}@example.com`,
        name: "VLD-003 Member",
        passwordHash: await argon2.hash(password),
        status: "INVITED",
      },
    });
    await prisma.userRole.create({
      data: {
        organizationId,
        userId: memberUser.id,
        roleId: memberRole!.id,
      },
    });

    const memberLogin = await request(app)
      .post("/api/v1/auth/login")
      .send({ organizationId, email: memberUser.email, password })
      .expect(200);
    const memberToken = memberLogin.body.data.tokens.accessToken as string;

    await request(app)
      .get("/api/v1/validation-runs")
      .set("Authorization", `Bearer ${memberToken}`)
      .expect(403);
    await request(app)
      .post("/api/v1/validation-runs")
      .set("Authorization", `Bearer ${memberToken}`)
      .send({})
      .expect(403);

    // 13) Outbox carries both validation event types
    const failed = await prisma.outboxEvent.findFirst({
      where: {
        organizationId,
        eventType: DOMAIN_EVENTS.ValidationFailed,
      },
    });
    expect(failed).not.toBeNull();

    // A compliant rule (consent-withdrawn-correctly with zero withdrawals)
    // still publishes a completed event.
    const completed = await prisma.outboxEvent.findFirst({
      where: {
        organizationId,
        eventType: DOMAIN_EVENTS.ValidationCompleted,
      },
    });
    expect(completed).not.toBeNull();
  });
});
