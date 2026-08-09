import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { createApp } from "../../../app.js";
import { prisma } from "../../../infrastructure/database/prisma-client.js";
import { signAccessToken } from "../../auth/utils/jwt.js";
import { PERMISSIONS } from "../../../shared/constants/permissions.js";
import { deleteTestOrganizations } from "../../../test-utils/cleanup-organizations.js";

describe("Organizations HTTP API", () => {
  const app = createApp();
  const createdIds: string[] = [];

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await deleteTestOrganizations(createdIds);
    await prisma.$disconnect();
  });

  function tokenFor(
    organizationId: string,
    permissions: string[],
    actorUserId = randomUUID(),
  ) {
    return signAccessToken({
      actorUserId,
      organizationId,
      roles: ["ORG_ADMIN"],
      permissions,
    });
  }

  it("POST /api/v1/organizations creates org and system roles", async () => {
    const res = await request(app)
      .post("/api/v1/organizations")
      .send({
        name: `HTTP Org ${Date.now()}`,
        industry: "Retail",
        operatingRegion: "IN",
      })
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data.organization.id).toBeTruthy();
    expect(res.body.data.systemRoles).toContain("ORG_ADMIN");
    createdIds.push(res.body.data.organization.id);
  });

  it("GET and PATCH /api/v1/organizations/:id require auth and permission", async () => {
    const created = await request(app)
      .post("/api/v1/organizations")
      .send({ name: `HTTP Patch Org ${Date.now()}` })
      .expect(201);

    const id = created.body.data.organization.id as string;
    createdIds.push(id);

    await request(app).get(`/api/v1/organizations/${id}`).expect(401);

    const reader = tokenFor(id, [PERMISSIONS.ORGANIZATION_READ]);
    const got = await request(app)
      .get(`/api/v1/organizations/${id}`)
      .set("Authorization", `Bearer ${reader}`)
      .expect(200);
    expect(got.body.data.id).toBe(id);

    const writer = tokenFor(id, [
      PERMISSIONS.ORGANIZATION_READ,
      PERMISSIONS.ORGANIZATION_UPDATE,
    ]);
    const patched = await request(app)
      .patch(`/api/v1/organizations/${id}`)
      .set("Authorization", `Bearer ${writer}`)
      .send({ companySize: "51-200" })
      .expect(200);
    expect(patched.body.data.companySize).toBe("51-200");
  });

  it("rejects cross-tenant organization access", async () => {
    const created = await request(app)
      .post("/api/v1/organizations")
      .send({ name: `HTTP Tenant Org ${Date.now()}` })
      .expect(201);
    const id = created.body.data.organization.id as string;
    createdIds.push(id);

    const otherOrgToken = tokenFor(randomUUID(), [
      PERMISSIONS.ORGANIZATION_READ,
      PERMISSIONS.ORGANIZATION_UPDATE,
    ]);

    await request(app)
      .get(`/api/v1/organizations/${id}`)
      .set("Authorization", `Bearer ${otherOrgToken}`)
      .expect(403);
  });

  it("rejects invalid create payloads", async () => {
    const res = await request(app)
      .post("/api/v1/organizations")
      .send({ name: "" })
      .expect(400);

    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});
