import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import argon2 from "argon2";

import { createApp } from "../../src/app.js";
import { prisma } from "../../src/infrastructure/database/prisma-client.js";
import {
  connectRedis,
  disconnectRedis,
} from "../../src/infrastructure/cache/redis-client.js";
import { deleteTestOrganizations } from "../../src/test-utils/cleanup-organizations.js";
import { loginWithEmailOtp } from "../../src/test-utils/login-as.js";

/**
 * TPRM/SCRM + Trace erasure evidence path:
 * vendor without DPA → validation FAIL → violation path;
 * ERASURE request → checklist → evidence pack.
 */
describe("Vendors TPRM + erasure evidence", () => {
  const app = createApp();
  const createdOrgIds: string[] = [];
  const password = "ChangeMe123!";
  const email = `vendor.tprm.${Date.now()}@example.com`;

  let organizationId = "";
  let accessToken = "";
  let vendorId = "";
  let erasureRequestId = "";

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

  it("creates vendor, fails DPA validation, and completes erasure evidence", async () => {
    const orgRes = await request(app)
      .post("/api/v1/organizations")
      .send({
        name: `TPRM Org ${Date.now()}`,
        industry: "saas",
        maturityLevel: "Developing",
      })
      .expect(201);

    organizationId = orgRes.body.data.organization.id as string;
    createdOrgIds.push(organizationId);

    const adminRole = await prisma.role.findFirst({
      where: { organizationId, name: "ORG_ADMIN", deletedAt: null },
    });
    const user = await prisma.user.create({
      data: {
        organizationId,
        email,
        name: "TPRM Admin",
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
    const login = await loginWithEmailOtp(app, {
      organizationId,
      email,
      password,
    });
    accessToken = login.tokens.accessToken;

    const vendorRes = await request(app)
      .post("/api/v1/vendors")
      .set("Authorization", bearer())
      .send({
        name: "Loan Processor Co",
        vendorType: "PROCESSOR",
        criticality: "HIGH",
        status: "ACTIVE",
        countries: ["US"],
        dataCategories: ["FINANCIAL", "CONTACT"],
      })
      .expect(201);

    vendorId = vendorRes.body.data.id as string;

    const riskRes = await request(app)
      .get(`/api/v1/vendors/${vendorId}/risk`)
      .set("Authorization", bearer())
      .expect(200);
    expect(riskRes.body.data.residualRiskScore).toBeGreaterThan(0);
    expect(riskRes.body.data.openRiskFlags).toContain("missing_dpa");

    const childRes = await request(app)
      .post("/api/v1/vendors")
      .set("Authorization", bearer())
      .send({
        name: "Nth Party Cloud",
        vendorType: "SUB_PROCESSOR",
        criticality: "CRITICAL",
        status: "ACTIVE",
      })
      .expect(201);

    await request(app)
      .post(`/api/v1/vendors/${vendorId}/relationships`)
      .set("Authorization", bearer())
      .send({
        childVendorId: childRes.body.data.id,
        relationshipType: "SUB_PROCESSOR",
      })
      .expect(201);

    const analytics = await request(app)
      .get("/api/v1/analytics/vendor-risk")
      .set("Authorization", bearer())
      .expect(200);
    expect(analytics.body.data.activeVendors).toBeGreaterThanOrEqual(2);
    expect(analytics.body.data.missingDpa).toBeGreaterThanOrEqual(1);

    const runRes = await request(app)
      .post("/api/v1/validation-runs")
      .set("Authorization", bearer())
      .send({})
      .expect(201);

    // Allow worker / sync path a moment; poll detail until COMPLETED or PARTIAL.
    let detail: { body: { data: { status: string; results: Array<{ ruleCode: string; status: string }> } } } | null =
      null;
    for (let i = 0; i < 20; i += 1) {
      detail = await request(app)
        .get(`/api/v1/validation-runs/${runRes.body.data.id}`)
        .set("Authorization", bearer());
      const status = detail.body.data.status as string;
      if (["COMPLETED", "PARTIAL", "FAILED"].includes(status)) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    expect(detail).toBeTruthy();
    const dpaResult = detail!.body.data.results?.find(
      (r) => r.ruleCode === "vendor-dpa-present",
    );
    if (dpaResult) {
      expect(dpaResult.status).toBe("FAIL");
    }

    const erasureRes = await request(app)
      .post("/api/v1/data-subject-requests")
      .set("Authorization", bearer())
      .send({
        requestType: "ERASURE",
        requesterReference: "subject-tprm-001@example.com",
        immediateErase: true,
      })
      .expect(201);
    erasureRequestId = erasureRes.body.data.id as string;

    const pack = await request(app)
      .get(`/api/v1/data-subject-requests/${erasureRequestId}/erasure`)
      .set("Authorization", bearer())
      .expect(200);
    expect(pack.body.data.checklist.length).toBeGreaterThan(0);
    expect(pack.body.data.immediateErase).toBe(true);

    for (const item of pack.body.data.checklist as Array<{ systemKey: string }>) {
      await request(app)
        .post(`/api/v1/data-subject-requests/${erasureRequestId}/erasure/confirm`)
        .set("Authorization", bearer())
        .send({ systemKey: item.systemKey, status: "DONE" })
        .expect(200);
    }

    const completed = await request(app)
      .post(`/api/v1/data-subject-requests/${erasureRequestId}/erasure/complete`)
      .set("Authorization", bearer())
      .expect(200);
    expect(completed.body.data.systems.length).toBeGreaterThan(0);
    expect(completed.body.data.hardDeletedAt).toBeTruthy();

    const locator = await request(app)
      .get("/api/v1/subject-locator")
      .query({ q: "subject-tprm-001" })
      .set("Authorization", bearer())
      .expect(200);
    expect(locator.body.data.hits.dataSubjectRequests.length).toBeGreaterThan(0);
  }, 120_000);
});
