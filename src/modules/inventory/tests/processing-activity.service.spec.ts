import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";

import { prisma } from "../../../infrastructure/database/prisma-client.js";
import { DOMAIN_EVENTS } from "../../../events/types/base-event.interface.js";
import type { RequestContext } from "../../../shared/types/request-context.js";

import { DataAssetService } from "../services/data-asset.service.js";
import { ProcessingActivityService } from "../services/processing-activity.service.js";

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

describe("ProcessingActivityService", () => {
  const service = new ProcessingActivityService();
  const assetService = new DataAssetService();

  const createdOrgIds: string[] = [];
  const createdAssetIds: string[] = [];
  const createdActivityIds: string[] = [];

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    if (createdActivityIds.length > 0) {
      await prisma.processingActivity.deleteMany({
        where: { id: { in: createdActivityIds } },
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
      assetName: overrides.assetName ?? "Customer Records",
      assetType: "Database",
      category: "Personal",
      sensitivity: "HIGH",
    });
    createdAssetIds.push(asset.id);
    return asset.id;
  }

  it("creates a processing activity with an outbox event", async () => {
    const orgId = await createOrg(`INV-002 Create Org ${Date.now()}`);
    const ctx = makeContext(orgId);
    const dataAssetId = await createAsset(ctx);

    const activity = await service.create(ctx, {
      dataAssetId,
      purpose: "CRM operations",
      sourceSystem: "Salesforce",
      processorName: "Acme Data Processing Ltd",
      legalBasis: "Consent",
      retentionRule: "36 months",
      notes: "Monthly sync",
    });

    createdActivityIds.push(activity.id);

    expect(activity.id).toBeTruthy();
    expect(activity.dataAssetId).toBe(dataAssetId);
    expect(activity.purpose).toBe("CRM operations");
    expect(activity.sourceSystem).toBe("Salesforce");
    expect(activity.notes).toBe("Monthly sync");

    const fetched = await service.getById(ctx, activity.id);
    expect(fetched.id).toBe(activity.id);

    const outbox = await prisma.outboxEvent.findFirst({
      where: {
        organizationId: orgId,
        eventType: DOMAIN_EVENTS.ProcessingActivityCreated,
      },
    });
    expect(outbox).not.toBeNull();
    expect(outbox?.publishedAt).toBeNull();
  });

  it("lists and filters processing activities by data asset", async () => {
    const orgId = await createOrg(`INV-002 List Org ${Date.now()}`);
    const ctx = makeContext(orgId);
    const dataAssetId = await createAsset(ctx);

    const first = await service.create(ctx, {
      dataAssetId,
      purpose: "List purpose A",
    });
    const second = await service.create(ctx, {
      dataAssetId,
      purpose: "List purpose B",
    });
    createdActivityIds.push(first.id, second.id);

    const all = await service.list(ctx);
    expect(all.some((a) => a.id === first.id)).toBe(true);
    expect(all.some((a) => a.id === second.id)).toBe(true);

    const filtered = await service.list(ctx, { dataAssetId });
    expect(filtered.length).toBe(2);
    expect(
      filtered.every((a) => a.dataAssetId === dataAssetId),
    ).toBe(true);
  });

  it("updates a processing activity", async () => {
    const orgId = await createOrg(`INV-002 Update Org ${Date.now()}`);
    const ctx = makeContext(orgId);
    const dataAssetId = await createAsset(ctx);

    const activity = await service.create(ctx, {
      dataAssetId,
      purpose: "Before update",
    });
    createdActivityIds.push(activity.id);

    const updated = await service.update(ctx, activity.id, {
      purpose: "After update",
      recipientType: "Processor",
      notes: null,
    });

    expect(updated.purpose).toBe("After update");
    expect(updated.recipientType).toBe("Processor");
    expect(updated.notes).toBeNull();
  });

  it("rejects referencing a data asset from another organization", async () => {
    const orgId = await createOrg(`INV-002 Tenant A ${Date.now()}`);
    const ctx = makeContext(orgId);
    const localAssetId = await createAsset(ctx);

    const otherOrgId = await createOrg(`INV-002 Tenant B ${Date.now()}`);
    const otherCtx = makeContext(otherOrgId);
    const otherAssetId = await createAsset(otherCtx, {
      assetName: "Other Org Records",
    });

    await expect(
      service.create(ctx, {
        dataAssetId: otherAssetId,
        purpose: "Cross-tenant attempt",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    const localActivity = await service.create(ctx, {
      dataAssetId: localAssetId,
      purpose: "Local activity",
    });
    createdActivityIds.push(localActivity.id);

    await expect(
      service.update(ctx, localActivity.id, {
        dataAssetId: otherAssetId,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("soft deletes a processing activity so it is no longer readable", async () => {
    const orgId = await createOrg(`INV-002 Delete Org ${Date.now()}`);
    const ctx = makeContext(orgId);
    const dataAssetId = await createAsset(ctx);

    const activity = await service.create(ctx, {
      dataAssetId,
      purpose: "To be deleted",
    });
    createdActivityIds.push(activity.id);

    const deleted = await service.softDelete(ctx, activity.id);
    expect(deleted.id).toBe(activity.id);

    await expect(service.getById(ctx, activity.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });

    const remaining = await service.list(ctx);
    expect(remaining.some((a) => a.id === activity.id)).toBe(false);
  });

  it("throws NOT_FOUND for unknown ids", async () => {
    const orgId = await createOrg(`INV-002 Missing Org ${Date.now()}`);
    const ctx = makeContext(orgId);
    const missingId = randomUUID();

    await expect(service.getById(ctx, missingId)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(service.update(ctx, missingId, {})).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(service.softDelete(ctx, missingId)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});
