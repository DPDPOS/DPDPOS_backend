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

/**
 * Cross-module happy path for Developer B — Feature CON-001:
 * org → login → data asset → notice versioning → consent record → withdraw → outbox
 */
describe("Dev B consent management end-to-end", () => {
  const app = createApp();
  const createdOrgIds: string[] = [];
  const password = "ChangeMe123!";
  const email = `con001.admin.${Date.now()}@example.com`;

  let organizationId = "";
  let accessToken = "";
  let dataAssetId = "";
  let noticeId = "";
  let consentRecordId = "";

  beforeAll(async () => {
    await prisma.$connect();
    await connectRedis();
  });

  afterAll(async () => {
    if (createdOrgIds.length > 0) {
      await prisma.consentRecord.deleteMany({
        where: { organizationId: { in: createdOrgIds } },
      });
      await prisma.notice.deleteMany({
        where: { organizationId: { in: createdOrgIds } },
      });
      await prisma.processingActivity.deleteMany({
        where: { organizationId: { in: createdOrgIds } },
      });
      await prisma.dataAsset.deleteMany({
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

  it("runs the full consent management flow", async () => {
    // 1) Organization (seeds system roles)
    const orgRes = await request(app)
      .post("/api/v1/organizations")
      .send({
        name: `CON-001 Fiduciary ${Date.now()}`,
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
        name: "CON-001 Admin",
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

    // 3) Data asset (INV-001 prerequisite for consent linkage)
    const asset = await request(app)
      .post("/api/v1/data-assets")
      .set("Authorization", bearer())
      .send({
        assetName: "Marketing Contact Database",
        assetType: "Database",
        category: "Personal",
        sensitivity: "HIGH",
      })
      .expect(201);
    dataAssetId = asset.body.data.id as string;

    // 4) Create notice (v1)
    const notice = await request(app)
      .post("/api/v1/notices")
      .set("Authorization", bearer())
      .send({
        title: "Marketing Consent Notice",
        content:
          "We process your contact details for marketing only with your consent.",
        effectiveFrom: "2026-08-01T00:00:00.000Z",
      })
      .expect(201);

    expect(notice.body.data.title).toBe("Marketing Consent Notice");
    expect(notice.body.data.version).toBe(1);
    noticeId = notice.body.data.id as string;

    // 5) Re-publish same title → version 2
    const noticeV2 = await request(app)
      .post("/api/v1/notices")
      .set("Authorization", bearer())
      .send({
        title: "Marketing Consent Notice",
        content: "Updated marketing notice language.",
      })
      .expect(201);
    expect(noticeV2.body.data.version).toBe(2);

    // 6) List + get notice
    const notices = await request(app)
      .get("/api/v1/notices")
      .set("Authorization", bearer())
      .expect(200);
    expect(
      notices.body.data.some((n: { id: string }) => n.id === noticeId),
    ).toBe(true);

    const gotNotice = await request(app)
      .get(`/api/v1/notices/${noticeId}`)
      .set("Authorization", bearer())
      .expect(200);
    expect(gotNotice.body.data.id).toBe(noticeId);

    // 7) Record consent (ConsentRecorded outbox)
    const created = await request(app)
      .post("/api/v1/consent-records")
      .set("Authorization", bearer())
      .send({
        dataSubjectIdentifier: "data-principal@example.com",
        noticeId,
        dataAssetId,
        purpose: "Marketing communication",
        proofFileId: "evidence/proof-consent-001",
      })
      .expect(201);

    expect(created.body.data.consentState).toBe("GRANTED");
    expect(created.body.data.noticeId).toBe(noticeId);
    expect(created.body.data.dataAssetId).toBe(dataAssetId);
    consentRecordId = created.body.data.id as string;

    // 8) List + filter consent records
    const list = await request(app)
      .get("/api/v1/consent-records")
      .set("Authorization", bearer())
      .expect(200);
    expect(
      list.body.data.some((r: { id: string }) => r.id === consentRecordId),
    ).toBe(true);

    const filtered = await request(app)
      .get("/api/v1/consent-records")
      .query({ consentState: "GRANTED", dataAssetId })
      .set("Authorization", bearer())
      .expect(200);
    expect(filtered.body.data.length).toBeGreaterThan(0);
    expect(
      filtered.body.data.every(
        (r: { consentState: string }) => r.consentState === "GRANTED",
      ),
    ).toBe(true);

    // 9) Get consent record by id
    const got = await request(app)
      .get(`/api/v1/consent-records/${consentRecordId}`)
      .set("Authorization", bearer())
      .expect(200);
    expect(got.body.data.id).toBe(consentRecordId);

    // 10) Withdraw consent (ConsentWithdrawn outbox)
    const withdrawn = await request(app)
      .post(`/api/v1/consent-records/${consentRecordId}/withdraw`)
      .set("Authorization", bearer())
      .expect(200);
    expect(withdrawn.body.data.consentState).toBe("WITHDRAWN");
    expect(withdrawn.body.data.withdrawnAt).not.toBeNull();

    // 11) Re-withdraw → 409 conflict
    await request(app)
      .post(`/api/v1/consent-records/${consentRecordId}/withdraw`)
      .set("Authorization", bearer())
      .expect(409);

    // 12) Validation error on missing required field
    const invalid = await request(app)
      .post("/api/v1/consent-records")
      .set("Authorization", bearer())
      .send({ purpose: "missing identifier" })
      .expect(400);
    expect(invalid.body.success).toBe(false);
    expect(invalid.body.error.code).toBe("VALIDATION_ERROR");

    // 13) Unauthorized without token
    await request(app).get("/api/v1/consent-records").expect(401);

    // 14) MEMBER role is denied consent/notice endpoints (permission wiring)
    const memberRole = await prisma.role.findFirst({
      where: { organizationId, name: "MEMBER", deletedAt: null },
    });
    expect(memberRole).toBeTruthy();

    const memberUser = await prisma.user.create({
      data: {
        organizationId,
        email: `con001.member.${Date.now()}@example.com`,
        name: "CON-001 Member",
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
      .get("/api/v1/consent-records")
      .set("Authorization", `Bearer ${memberToken}`)
      .expect(403);
    await request(app)
      .get("/api/v1/notices")
      .set("Authorization", `Bearer ${memberToken}`)
      .expect(403);

    // 15) Soft delete notice → no longer readable
    await request(app)
      .delete(`/api/v1/notices/${noticeId}`)
      .set("Authorization", bearer())
      .expect(200);
    await request(app)
      .get(`/api/v1/notices/${noticeId}`)
      .set("Authorization", bearer())
      .expect(404);

    // 16) Outbox contains both consent events
    const recorded = await prisma.outboxEvent.findFirst({
      where: {
        organizationId,
        eventType: DOMAIN_EVENTS.ConsentRecorded,
      },
    });
    expect(recorded).not.toBeNull();

    const withdrawnEvent = await prisma.outboxEvent.findFirst({
      where: {
        organizationId,
        eventType: DOMAIN_EVENTS.ConsentWithdrawn,
      },
    });
    expect(withdrawnEvent).not.toBeNull();
  });
});
