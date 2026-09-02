import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/infrastructure/database/prisma-client.js";
import { deleteTestOrganizations } from "../../src/test-utils/cleanup-organizations.js";
import { getOnboardingQuestions } from "../../src/modules/onboarding/domain/onboarding-questionnaire.js";

describe("Signup + org onboarding HTTP", () => {
  const app = createApp();
  const createdIds: string[] = [];
  const suffix = Date.now();
  const email = `founder-${suffix}@example.com`;
  const password = "SignupPass123!";

  let organizationId = "";
  let accessToken = "";

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await deleteTestOrganizations(createdIds);
    await prisma.$disconnect();
  });

  it("signs up a new organisation with an admin session", async () => {
    const res = await request(app)
      .post("/api/v1/auth/signup")
      .send({
        organizationName: `Signup Org ${suffix}`,
        adminName: "Founder Admin",
        email,
        password,
        industry: "it_saas",
      })
      .expect(201);

    expect(res.body.success).toBe(true);
    organizationId = res.body.data.organization.id as string;
    createdIds.push(organizationId);
    accessToken = res.body.data.tokens.accessToken as string;

    expect(res.body.data.user.requiresOnboarding).toBe(true);
    expect(res.body.data.user.onboardingCompleted).toBe(false);
    expect(res.body.data.organization.onboardingCompleted).toBe(false);
  });

  it("looks up organisations by email for login", async () => {
    const res = await request(app)
      .post("/api/v1/auth/lookup-organizations")
      .send({ email })
      .expect(200);

    expect(res.body.data.organizations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: organizationId,
          onboardingCompleted: false,
        }),
      ]),
    );
  });

  it("blocks assessment create until onboarding is complete", async () => {
    const blocked = await request(app)
      .post("/api/v1/assessments")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Too early" })
      .expect(400);

    expect(String(blocked.body.error?.message ?? blocked.body.message)).toMatch(
      /onboarding/i,
    );
  });

  it("completes profile + questionnaire once, then allows assessments", async () => {
    await request(app)
      .patch("/api/v1/onboarding/profile")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        industry: "it_saas",
        companySize: "51-200",
        operatingRegion: "IN",
        companyType: "Private Limited",
        maturityLevel: "Developing",
      })
      .expect(200);

    const catalog = await request(app)
      .get("/api/v1/onboarding/questionnaire")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);

    const questions = getOnboardingQuestions("it_saas");
    const answersByCode = new Map<string, unknown>();
    const answers: Array<{ questionCode: string; value: boolean | string }> = [];

    for (const q of questions) {
      if (q.showIf) {
        const prior = answersByCode.get(q.showIf.code);
        if (prior !== q.showIf.equals) continue;
      }
      let value: boolean | string = q.valueType === "boolean" ? true : (q.options?.[0] ?? "yes");
      if (q.code === "Q-VENDORS") value = false;
      answersByCode.set(q.code, value);
      answers.push({ questionCode: q.code, value });
    }

    // Save in chunks to stay under body limits if any
    const chunkSize = 40;
    for (let i = 0; i < answers.length; i += chunkSize) {
      await request(app)
        .put("/api/v1/onboarding/answers")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ answers: answers.slice(i, i + chunkSize) })
        .expect(200);
    }

    const completed = await request(app)
      .post("/api/v1/onboarding/complete")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);

    expect(completed.body.data.completed).toBe(true);
    expect(completed.body.data.alreadyComplete).toBe(false);

    const status = await request(app)
      .get("/api/v1/onboarding/status")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);

    expect(status.body.data.requiresOnboarding).toBe(false);
    expect(status.body.data.completed).toBe(true);

    const me = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);

    expect(me.body.data.onboardingCompleted).toBe(true);
    expect(me.body.data.requiresOnboarding).toBe(false);

    // Completing again is idempotent — no popup every login.
    const again = await request(app)
      .post("/api/v1/onboarding/complete")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);
    expect(again.body.data.alreadyComplete).toBe(true);

    await request(app)
      .post("/api/v1/assessments")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Post-onboarding assessment" })
      .expect(201);
  });
});
