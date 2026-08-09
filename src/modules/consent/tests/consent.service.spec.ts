import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";

import { prisma } from "../../../infrastructure/database/prisma-client.js";
import { DOMAIN_EVENTS } from "../../../events/types/base-event.interface.js";
import type { RequestContext } from "../../../shared/types/request-context.js";

import { DataAssetService } from "../../inventory/services/data-asset.service.js";
import { NoticeService } from "../services/notice.service.js";
import { ConsentRecordService } from "../services/consent-record.service.js";

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

describe("Consent module (CON-001)", () => {
  const noticeService = new NoticeService();
  const consentService = new ConsentRecordService();
  const assetService = new DataAssetService();

  const createdOrgIds: string[] = [];
  const createdNoticeIds: string[] = [];
  const createdAssetIds: string[] = [];
  const createdConsentIds: string[] = [];

  beforeAll(async () => {
    await prisma.$connect();
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
    if (createdOrgIds.length > 0) {
      await prisma.outboxEvent.deleteMany({
        where: { organizationId: { in: createdOrgIds } },
      });
      await deleteTestOrganizations(createdOrgIds);
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

  async function createAsset(
    ctx: RequestContext,
    overrides: { assetName?: string } = {},
  ): Promise<string> {
    const asset = await assetService.create(ctx, {
      assetName: overrides.assetName ?? "Consent Records DB",
      assetType: "Database",
      category: "Personal",
      sensitivity: "HIGH",
    });
    createdAssetIds.push(asset.id);
    return asset.id;
  }

  it("creates a notice with version 1 and records the publisher", async () => {
    const orgId = await createOrg(`CON-001 Notice Org ${Date.now()}`);
    const ctx = makeContext(orgId);

    const notice = await noticeService.create(ctx, {
      title: "Privacy Notice",
      content: "We process your data under the DPDP Act.",
      effectiveFrom: "2026-08-01T00:00:00.000Z",
    });

    createdNoticeIds.push(notice.id);

    expect(notice.id).toBeTruthy();
    expect(notice.title).toBe("Privacy Notice");
    expect(notice.version).toBe(1);
    expect(notice.effectiveFrom).toBe("2026-08-01T00:00:00.000Z");
    expect(notice.publishedBy).toBe(ctx.actorUserId);

    const fetched = await noticeService.getById(ctx, notice.id);
    expect(fetched.id).toBe(notice.id);
  });

  it("versions notices by title (same title produces the next version)", async () => {
    const orgId = await createOrg(`CON-001 Version Org ${Date.now()}`);
    const ctx = makeContext(orgId);

    const v1 = await noticeService.create(ctx, {
      title: "Refund Policy",
      content: "Version one.",
    });
    createdNoticeIds.push(v1.id);

    const v2 = await noticeService.create(ctx, {
      title: "Refund Policy",
      content: "Version two.",
    });
    createdNoticeIds.push(v2.id);

    expect(v1.version).toBe(1);
    expect(v2.version).toBe(2);
    expect(v2.content).toBe("Version two.");

    const all = await noticeService.list(ctx);
    expect(all.length).toBe(2);
  });

  it("records consent and writes a ConsentRecorded outbox event", async () => {
    const orgId = await createOrg(`CON-001 Record Org ${Date.now()}`);
    const ctx = makeContext(orgId);

    const notice = await noticeService.create(ctx, {
      title: "Marketing Notice",
      content: "We send offers with your consent.",
    });
    createdNoticeIds.push(notice.id);

    const dataAssetId = await createAsset(ctx);

    const record = await consentService.create(ctx, {
      dataSubjectIdentifier: "data-principal-001@example.com",
      noticeId: notice.id,
      dataAssetId,
      purpose: "Marketing communication",
      proofFileId: "evidence/proof-001",
    });
    createdConsentIds.push(record.id);

    expect(record.id).toBeTruthy();
    expect(record.consentState).toBe("GRANTED");
    expect(record.noticeId).toBe(notice.id);
    expect(record.dataAssetId).toBe(dataAssetId);
    expect(record.withdrawnAt).toBeNull();

    const outbox = await prisma.outboxEvent.findFirst({
      where: {
        organizationId: orgId,
        eventType: DOMAIN_EVENTS.ConsentRecorded,
      },
    });
    expect(outbox).not.toBeNull();
    expect(outbox?.publishedAt).toBeNull();
  });

  it("rejects consent records referencing assets or notices from another organization", async () => {
    const orgId = await createOrg(`CON-001 Tenant A ${Date.now()}`);
    const ctx = makeContext(orgId);

    const otherOrgId = await createOrg(`CON-001 Tenant B ${Date.now()}`);
    const otherCtx = makeContext(otherOrgId);
    const otherNotice = await noticeService.create(otherCtx, {
      title: "Other Org Notice",
      content: "Belongs to another tenant.",
    });
    createdNoticeIds.push(otherNotice.id);
    const otherAssetId = await createAsset(otherCtx, {
      assetName: "Other Org Asset",
    });

    await expect(
      consentService.create(ctx, {
        dataSubjectIdentifier: "tenant-a@example.com",
        noticeId: otherNotice.id,
        purpose: "Cross-tenant attempt",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    await expect(
      consentService.create(ctx, {
        dataSubjectIdentifier: "tenant-a@example.com",
        dataAssetId: otherAssetId,
        purpose: "Cross-tenant attempt",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("lists and filters consent records", async () => {
    const orgId = await createOrg(`CON-001 List Org ${Date.now()}`);
    const ctx = makeContext(orgId);
    const dataAssetId = await createAsset(ctx);

    const first = await consentService.create(ctx, {
      dataSubjectIdentifier: "list-subject@example.com",
      dataAssetId,
      purpose: "List purpose A",
    });
    const second = await consentService.create(ctx, {
      dataSubjectIdentifier: "list-subject@example.com",
      dataAssetId,
      purpose: "List purpose B",
    });
    createdConsentIds.push(first.id, second.id);

    const all = await consentService.list(ctx);
    expect(all.some((r) => r.id === first.id)).toBe(true);
    expect(all.some((r) => r.id === second.id)).toBe(true);

    const byAsset = await consentService.list(ctx, { dataAssetId });
    expect(byAsset.length).toBe(2);

    const byState = await consentService.list(ctx, {
      consentState: "GRANTED",
    });
    expect(byState.length).toBeGreaterThanOrEqual(2);

    const bySubject = await consentService.list(ctx, {
      dataSubjectIdentifier: "list-subject@example.com",
    });
    expect(bySubject.length).toBe(2);
  });

  it("withdraws consent and writes a ConsentWithdrawn outbox event", async () => {
    const orgId = await createOrg(`CON-001 Withdraw Org ${Date.now()}`);
    const ctx = makeContext(orgId);

    const record = await consentService.create(ctx, {
      dataSubjectIdentifier: "withdraw-subject@example.com",
      purpose: "Withdrawal test",
    });
    createdConsentIds.push(record.id);

    const withdrawn = await consentService.withdraw(ctx, record.id);

    expect(withdrawn.consentState).toBe("WITHDRAWN");
    expect(withdrawn.withdrawnAt).not.toBeNull();

    const outbox = await prisma.outboxEvent.findFirst({
      where: {
        organizationId: orgId,
        eventType: DOMAIN_EVENTS.ConsentWithdrawn,
      },
    });
    expect(outbox).not.toBeNull();
    expect(outbox?.publishedAt).toBeNull();
  });

  it("rejects withdrawing an already-withdrawn consent record", async () => {
    const orgId = await createOrg(`CON-001 Re-withdraw Org ${Date.now()}`);
    const ctx = makeContext(orgId);

    const record = await consentService.create(ctx, {
      dataSubjectIdentifier: "twice-subject@example.com",
      purpose: "Double withdrawal",
    });
    createdConsentIds.push(record.id);

    await consentService.withdraw(ctx, record.id);

    await expect(consentService.withdraw(ctx, record.id)).rejects.toMatchObject(
      { code: "CONFLICT" },
    );
  });

  it("soft deletes a notice so it is no longer readable", async () => {
    const orgId = await createOrg(`CON-001 Delete Notice Org ${Date.now()}`);
    const ctx = makeContext(orgId);

    const notice = await noticeService.create(ctx, {
      title: "To Be Deleted",
      content: "Deprecated notice.",
    });
    createdNoticeIds.push(notice.id);

    const deleted = await noticeService.softDelete(ctx, notice.id);
    expect(deleted.id).toBe(notice.id);

    await expect(noticeService.getById(ctx, notice.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });

    const remaining = await noticeService.list(ctx);
    expect(remaining.some((n) => n.id === notice.id)).toBe(false);
  });

  it("throws NOT_FOUND for unknown ids", async () => {
    const orgId = await createOrg(`CON-001 Missing Org ${Date.now()}`);
    const ctx = makeContext(orgId);
    const missingId = randomUUID();

    await expect(noticeService.getById(ctx, missingId)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(consentService.getById(ctx, missingId)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(consentService.withdraw(ctx, missingId)).rejects.toMatchObject(
      { code: "NOT_FOUND" },
    );
  });
});
