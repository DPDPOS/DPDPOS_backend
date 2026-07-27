import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../../app.js";
import { prisma } from "../../../infrastructure/database/prisma-client.js";

describe("Organizations HTTP API", () => {
  const app = createApp();
  const createdIds: string[] = [];

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    if (createdIds.length > 0) {
      await prisma.outboxEvent.deleteMany({
        where: { organizationId: { in: createdIds } },
      });
      await prisma.role.deleteMany({
        where: { organizationId: { in: createdIds } },
      });
      await prisma.organization.deleteMany({
        where: { id: { in: createdIds } },
      });
    }
    await prisma.$disconnect();
  });

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

  it("GET and PATCH /api/v1/organizations/:id work end-to-end", async () => {
    const created = await request(app)
      .post("/api/v1/organizations")
      .send({ name: `HTTP Patch Org ${Date.now()}` })
      .expect(201);

    const id = created.body.data.organization.id as string;
    createdIds.push(id);

    const got = await request(app).get(`/api/v1/organizations/${id}`).expect(200);
    expect(got.body.data.id).toBe(id);

    const patched = await request(app)
      .patch(`/api/v1/organizations/${id}`)
      .send({ companySize: "51-200" })
      .expect(200);
    expect(patched.body.data.companySize).toBe("51-200");
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
