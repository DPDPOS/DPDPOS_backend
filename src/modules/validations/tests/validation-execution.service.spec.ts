import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";

import { prisma } from "../../../infrastructure/database/prisma-client.js";
import {
  connectRedis,
  disconnectRedis,
} from "../../../infrastructure/cache/redis-client.js";
import { DOMAIN_EVENTS } from "../../../events/types/base-event.interface.js";
import type { RequestContext } from "../../../shared/types/request-context.js";

import { DataAssetService } from "../../inventory/services/data-asset.service.js";
import { NoticeService } from "../../consent/services/notice.service.js";
import { ConsentRecordService } from "../../consent/services/consent-record.service.js";

import { ValidationRunService } from "../services/validation-run.service.js";
import { ValidationRuleService } from "../services/validation-rule.service.js";
import { ValidationExecutionService } from "../services/validation-execution.service.js";
import { processDailyValidationSweep } from "../jobs/validation-run.processor.js";
import { resolveEvaluator } from "../domain/rule.registry.js";

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

describe("Validation engine (VLD-003)", () => {
  const runsService = new ValidationRunService();
  const rulesService = new ValidationRuleService();
  const executionService = new ValidationExecutionService();
  const assetService = new DataAssetService();
  const noticeService = new NoticeService();
  const consentService = new ConsentRecordService();

  const createdOrgIds: string[] = [];
  const createdAssetIds: string[] = [];
  const createdNoticeIds: string[] = [];
  const createdConsentIds: string[] = [];
  const createdRuleIds: string[] = [];
  const createdRunIds: string[] = [];

  beforeAll(async () => {
    await prisma.$connect();
    await connectRedis();
  });

  afterAll(async () => {
    if (createdConsentIds.length > 0) {
      await prisma.consentRecord.deleteMany({
        where: { id: { in: createdConsentIds } },
      });
    }
    if (createdNoticeIds.length > 0) {
      await prisma.notice.deleteMany({
        where: { id: { in: createdNoticeIds } },
      });
    }
    if (createdAssetIds.length > 0) {
      await prisma.dataAsset.deleteMany({
        where: { id: { in: createdAssetIds } },
      });
    }
    // Sweeps can create SCHEDULED runs for orgs with active rules; helper
    // wipes results/runs/rules (and violations holding result FKs) in order.
    await deleteTestOrganizations(createdOrgIds);
    await disconnectRedis();
    await prisma.$disconnect();
  });

  async function createOrg(name: string): Promise<string> {
    const org = await prisma.organization.create({ data: { name } });
    createdOrgIds.push(org.id);
    return org.id;
  }

  async function createAsset(
    ctx: RequestContext,
    overrides: { assetName?: string; retentionPeriod?: string } = {},
  ): Promise<string> {
    const asset = await assetService.create(ctx, {
      assetName: overrides.assetName ?? "Validation Target DB",
      assetType: "Database",
      category: "Personal",
      sensitivity: "HIGH",
      retentionPeriod: overrides.retentionPeriod ?? "24 months",
    });
    createdAssetIds.push(asset.id);
    return asset.id;
  }

  it("registers evaluators for all five default rule codes", () => {
    for (const code of [
      "notice-present",
      "consent-present",
      "consent-withdrawn-correctly",
      "retention-metadata-set",
      "request-responded-within-sla",
    ]) {
      const evaluator = resolveEvaluator(code);
      expect(evaluator).not.toBeNull();
      expect(evaluator!.descriptor.code).toBe(code);
      expect(evaluator!.descriptor.category.length).toBeGreaterThan(0);
      expect(evaluator!.descriptor.severity.length).toBeGreaterThan(0);
    }
  });

  it("seeds default rules on first execution and completes a run with results", async () => {
    const orgId = await createOrg(`VLD-003 Fresh Org ${Date.now()}`);
    const ctx = makeContext(orgId);

    const run = await runsService.trigger(ctx, {});
    createdRunIds.push(run.id);

    expect(run.status).toBe("PENDING");
    expect(run.triggerType).toBe("MANUAL");
    expect(run.startedAt).toBeTruthy();

    const completed = await executionService.executeRun(run.id);

    expect(completed.status).toBe("COMPLETED");
    expect(completed.finishedAt).not.toBeNull();
    expect(completed.durationMs).not.toBeNull();
    expect(completed.durationMs!).toBeGreaterThanOrEqual(0);

    // Fresh org → all 5 defaults seeded and evaluated.
    const seeded = await prisma.validationRule.findMany({
      where: { organizationId: orgId, deletedAt: null },
    });
    expect(seeded.length).toBe(5);
    seeded.forEach((r) => createdRuleIds.push(r.id));

    const results = await prisma.validationResult.findMany({
      where: { runId: run.id },
    });
    expect(results.length).toBe(5);

    // notice-present must FAIL for an org with no notices.
    const noticeResult = results.find((r) => r.ruleCode === "notice-present");
    expect(noticeResult?.resultStatus).toBe("FAIL");
    expect(noticeResult?.evidenceRequiredFlag).toBe(true);

    const failedOutbox = await prisma.outboxEvent.findFirst({
      where: {
        organizationId: orgId,
        eventType: DOMAIN_EVENTS.ValidationFailed,
      },
    });
    // Existence only — parallel suites may relay unpublished outbox rows.
    expect(failedOutbox).not.toBeNull();
  });

  it("skips re-executing a completed run (idempotency guard)", async () => {
    const orgId = await createOrg(`VLD-003 Idempotent Org ${Date.now()}`);
    const ctx = makeContext(orgId);

    const run = await runsService.trigger(ctx, {});
    createdRunIds.push(run.id);

    await executionService.executeRun(run.id);

    // A retried job hitting a completed run is a no-op — same results, same status.
    const again = await executionService.executeRun(run.id);
    expect(again.status).toBe("COMPLETED");

    const results = await prisma.validationResult.findMany({
      where: { runId: run.id },
    });
    expect(results.length).toBe(5);
  });

  it("marks a run PARTIAL when a rule evaluation errors", async () => {
    const orgId = await createOrg(`VLD-003 Partial Org ${Date.now()}`);
    const ctx = makeContext(orgId);

    const run = await runsService.trigger(ctx, {});
    createdRunIds.push(run.id);

    // A throwing evaluator for a single rule code forces the ERROR path while
    // the remaining seeded rules evaluate normally.
    const throwingService = new ValidationExecutionService(
      undefined,
      undefined,
      undefined,
      undefined,
      (ruleCode) => {
        if (ruleCode === "notice-present") {
          return {
            descriptor: {
              code: "notice-present",
              title: "Notice is present",
              description: "",
              category: "NOTICE",
              severity: "MEDIUM",
            },
            evaluate: async () => {
              throw new Error("evaluator crashed");
            },
          };
        }
        return resolveEvaluator(ruleCode);
      },
    );

    const completed = await throwingService.executeRun(run.id);

    expect(completed.status).toBe("PARTIAL");

    const errorResult = await prisma.validationResult.findFirst({
      where: { runId: run.id, ruleCode: "notice-present" },
    });
    expect(errorResult?.resultStatus).toBe("ERROR");
    expect(errorResult?.explanation).toContain("evaluator crashed");

    // Other rules still evaluated (e.g. consent-withdrawn-correctly passes).
    const passResult = await prisma.validationResult.findFirst({
      where: { runId: run.id, ruleCode: "consent-withdrawn-correctly" },
    });
    expect(passResult?.resultStatus).toBe("PASS");
  });

  it("fails a run cleanly for a missing run id", async () => {
    await expect(
      executionService.executeRun(randomUUID()),
    ).rejects.toThrow(/not found/);
  });

  it("evaluates against real discovery data (passes when compliant)", async () => {
    const orgId = await createOrg(`VLD-003 Compliant Org ${Date.now()}`);
    const ctx = makeContext(orgId);

    const assetId = await createAsset(ctx, { retentionPeriod: "24 months" });
    const notice = await noticeService.create(ctx, {
      title: "Compliant Notice",
      content: "We process with consent.",
    });
    createdNoticeIds.push(notice.id);
    await consentService.create(ctx, {
      dataSubjectIdentifier: "compliant@example.com",
      dataAssetId: assetId,
      noticeId: notice.id,
      purpose: "Marketing",
    });
    const consent = await prisma.consentRecord.findFirst({
      where: { dataAssetId: assetId },
    });
    if (consent) createdConsentIds.push(consent.id);

    const run = await runsService.trigger(ctx, {});
    createdRunIds.push(run.id);

    const completed = await executionService.executeRun(run.id);

    expect(completed.status).toBe("COMPLETED");

    const results = await prisma.validationResult.findMany({
      where: { runId: run.id },
    });

    const noticeResult = results.find((r) => r.ruleCode === "notice-present");
    expect(noticeResult?.resultStatus).toBe("PASS");

    const consentResult = results.find((r) => r.ruleCode === "consent-present");
    expect(consentResult?.resultStatus).toBe("PASS");

    const retentionResult = results.find(
      (r) => r.ruleCode === "retention-metadata-set",
    );
    expect(retentionResult?.resultStatus).toBe("PASS");

    const completedOutbox = await prisma.outboxEvent.findFirst({
      where: {
        organizationId: orgId,
        eventType: DOMAIN_EVENTS.ValidationCompleted,
      },
    });
    expect(completedOutbox).not.toBeNull();
  });

  it("creates rule rows bound to registered evaluators and rejects unknown codes", async () => {
    const orgId = await createOrg(`VLD-003 Rules Org ${Date.now()}`);
    const ctx = makeContext(orgId);

    const rule = await rulesService.create(ctx, {
      ruleCode: "notice-present",
    });
    createdRuleIds.push(rule.id);

    expect(rule.ruleCode).toBe("notice-present");
    expect(rule.version).toBe(1);
    expect(rule.activeFlag).toBe(true);

    await expect(
      rulesService.create(ctx, {
        ruleCode: "no-such-evaluator",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("optimistic-locks rule updates (stale version → conflict)", async () => {
    const orgId = await createOrg(`VLD-003 Rule Version Org ${Date.now()}`);
    const ctx = makeContext(orgId);

    const rule = await rulesService.create(ctx, {
      ruleCode: "retention-metadata-set",
    });
    createdRuleIds.push(rule.id);

    await rulesService.update(ctx, rule.id, {
      version: 1,
      activeFlag: false,
    });

    await expect(
      rulesService.update(ctx, rule.id, {
        version: 1,
        severity: "CRITICAL",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("daily sweep creates SCHEDULED runs for orgs with active rules", async () => {
    const orgId = await createOrg(`VLD-003 Sweep Org ${Date.now()}`);
    const ctx = makeContext(orgId);

    // Seed rules by running once, then verify the sweep fans out a new run.
    const run = await runsService.trigger(ctx, {});
    createdRunIds.push(run.id);
    await executionService.executeRun(run.id);

    // Scope to this org — a global sweep would fan out across leftover DB orgs
    // and race cleanup / Redis workers during the suite.
    const sweep = await processDailyValidationSweep({
      organizationIds: [orgId],
    });

    expect(sweep.runsCreated).toBe(1);

    const scheduled = await prisma.validationRun.findMany({
      where: { organizationId: orgId, triggerType: "SCHEDULED" },
    });
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0].status).toBe("PENDING");
    scheduled.forEach((s) => createdRunIds.push(s.id));
  });

  it("lists runs with results via getById", async () => {
    const orgId = await createOrg(`VLD-003 List Org ${Date.now()}`);
    const ctx = makeContext(orgId);

    const run = await runsService.trigger(ctx, {});
    createdRunIds.push(run.id);
    await executionService.executeRun(run.id);

    const detail = await runsService.getById(ctx, run.id);
    expect(detail.id).toBe(run.id);
    expect(detail.results.length).toBe(5);

    const all = await runsService.list(ctx);
    expect(all.some((r) => r.id === run.id)).toBe(true);

    const completedOnly = await runsService.list(ctx, {
      status: "COMPLETED",
    });
    expect(completedOnly.some((r) => r.id === run.id)).toBe(true);
  });
});
