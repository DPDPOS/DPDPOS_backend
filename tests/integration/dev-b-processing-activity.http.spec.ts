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

import { deleteTestOrganizations } from "../../src/test-utils/cleanup-organizations.js";

/**
 * Cross-module happy path for Developer B — Feature INV-002:
 * org → login → data asset → processing activity CRUD → soft delete → outbox
 */
describe("Dev B processing activity end-to-end", () => {
  const app = createApp();
  const createdOrgIds: string[] = [];
  const password = "ChangeMe123!";
  const email = `inv002.admin.${Date.now()}@example.com`;

  let organizationId = "";
  let accessToken = "";
  let dataAssetId = "";

  beforeAll(async () => {
    await prisma.$connect();
    await connectRedis();
  });

  afterAll(async () => {
    await deleteTestOrganizations(createdOrgIds);
    await disconnectRedis();
    await prisma.$disconnect();
  });

  function bearer(token = accessToken) {
    return `Bearer ${token}`;
  }

  it("runs the full processing activity flow", async () => {
    // 1) Organization (seeds system roles)
    const orgRes = await request(app)
      .post("/api/v1/organizations")
      .send({
        name: `INV-002 Fiduciary ${Date.now()}`,
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
        name: "INV-002 Admin",
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

    // 3) Data asset (INV-001 prerequisite)
    const asset = await request(app)
      .post("/api/v1/data-assets")
      .set("Authorization", bearer())
      .send({
        assetName: "Customer Records",
        assetType: "Database",
        category: "Personal",
        sensitivity: "HIGH",
      })
      .expect(201);
    dataAssetId = asset.body.data.id as string;

    // 4) Create processing activity (ProcessingActivityCreated outbox)
    const created = await request(app)
      .post("/api/v1/processing-activities")
      .set("Authorization", bearer())
      .send({
        dataAssetId,
        purpose: "CRM operations",
        sourceSystem: "Salesforce",
        processorName: "Acme Data Processing Ltd",
        legalBasis: "Consent",
        retentionRule: "36 months",
        notes: "Monthly sync",
      })
      .expect(201);

    expect(created.body.data.dataAssetId).toBe(dataAssetId);
    expect(created.body.data.purpose).toBe("CRM operations");
    const activityId = created.body.data.id as string;

    // 5) List + filter by data asset
    const list = await request(app)
      .get("/api/v1/processing-activities")
      .set("Authorization", bearer())
      .expect(200);
    expect(
      list.body.data.some((a: { id: string }) => a.id === activityId),
    ).toBe(true);

    const filtered = await request(app)
      .get("/api/v1/processing-activities")
      .query({ dataAssetId })
      .set("Authorization", bearer())
      .expect(200);
    expect(filtered.body.data.length).toBeGreaterThan(0);
    expect(
      filtered.body.data.every(
        (a: { dataAssetId: string }) => a.dataAssetId === dataAssetId,
      ),
    ).toBe(true);

    // 6) Get by id
    const got = await request(app)
      .get(`/api/v1/processing-activities/${activityId}`)
      .set("Authorization", bearer())
      .expect(200);
    expect(got.body.data.id).toBe(activityId);

    // 7) Update
    const patched = await request(app)
      .patch(`/api/v1/processing-activities/${activityId}`)
      .set("Authorization", bearer())
      .send({
        purpose: "CRM operations (refined)",
        recipientType: "Processor",
      })
      .expect(200);
    expect(patched.body.data.purpose).toBe("CRM operations (refined)");
    expect(patched.body.data.recipientType).toBe("Processor");

    // 8) Validation error on missing required field
    const invalid = await request(app)
      .post("/api/v1/processing-activities")
      .set("Authorization", bearer())
      .send({ dataAssetId })
      .expect(400);
    expect(invalid.body.success).toBe(false);
    expect(invalid.body.error.code).toBe("VALIDATION_ERROR");

    // 9) Unauthorized without token
    await request(app)
      .get("/api/v1/processing-activities")
      .expect(401);

    // 10) Soft delete → no longer readable
    await request(app)
      .delete(`/api/v1/processing-activities/${activityId}`)
      .set("Authorization", bearer())
      .expect(200);
    await request(app)
      .get(`/api/v1/processing-activities/${activityId}`)
      .set("Authorization", bearer())
      .expect(404);

    // 11) Outbox contains ProcessingActivityCreated
    const outbox = await prisma.outboxEvent.findFirst({
      where: {
        organizationId,
        eventType: DOMAIN_EVENTS.ProcessingActivityCreated,
      },
    });
    expect(outbox).not.toBeNull();
  });
});
