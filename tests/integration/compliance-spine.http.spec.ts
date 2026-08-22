import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/infrastructure/database/prisma-client.js";
import { signAccessToken } from "../../src/modules/auth/utils/jwt.js";
import { ALL_PERMISSIONS } from "../../src/shared/constants/permissions.js";
import { deleteTestOrganizations } from "../../src/test-utils/cleanup-organizations.js";

function authHeader(organizationId: string, userId: string = randomUUID()): string {
  const token = signAccessToken({
    actorUserId: userId,
    organizationId,
    roles: ["ORG_ADMIN"],
    permissions: [...ALL_PERMISSIONS],
    jti: randomUUID(),
  });
  return `Bearer ${token}`;
}

describe("Compliance spine e2e (assessment → CLI → evaluate → report)", () => {
  const app = createApp();
  let organizationId = "";
  let userId = "";
  let assessmentId = "";
  let cliToken = "";
  let scanJobId = "";

  beforeAll(async () => {
    await prisma.$connect();
    const org = await request(app)
      .post("/api/v1/organizations")
      .send({ name: `Spine Org ${Date.now()}` })
      .expect(201);
    organizationId = org.body.data.organization.id as string;
    userId = randomUUID();
  });

  afterAll(async () => {
    if (!organizationId) {
      await prisma.$disconnect();
      return;
    }
    await deleteTestOrganizations([organizationId]);
    await prisma.$disconnect();
  });

  it("runs the full assessment CLI spine", async () => {
    const auth = authHeader(organizationId, userId);

    const catalog = await request(app)
      .get("/api/v1/assessments/questionnaire/catalog")
      .set("Authorization", auth)
      .expect(200);
    expect(catalog.body.data.questions.length).toBeGreaterThan(5);
    expect(catalog.body.data.stages?.length).toBeGreaterThan(2);
    expect(catalog.body.data.documentTypes?.length).toBeGreaterThan(3);

    const created = await request(app)
      .post("/api/v1/assessments")
      .set("Authorization", auth)
      .send({ name: "Spine Test Assessment" })
      .expect(201);
    assessmentId = created.body.data.id as string;
    expect(created.body.data.currentVersion).toBe(1);

    const doc = await request(app)
      .post(`/api/v1/assessments/${assessmentId}/documents`)
      .set("Authorization", auth)
      .send({
        fileName: "privacy-policy.txt",
        fileType: "text/plain",
        documentType: "PRIVACY_NOTICE",
        contentBase64: Buffer.from(
          "Privacy notice, consent, retention, breach process, DPA for vendors.",
        ).toString("base64"),
        extractedText:
          "Privacy notice, consent, retention, breach process, DPA for vendors.",
      })
      .expect(201);
    expect(doc.body.data.checksum).toBeTruthy();
    expect(doc.body.data.documentType).toBe("PRIVACY_NOTICE");

    await request(app)
      .post(`/api/v1/assessments/${assessmentId}/questionnaire/answers`)
      .set("Authorization", auth)
      .send({
        answers: [
          { questionCode: "Q-AUDIT-NOTICE-PUBLIC", value: true },
          { questionCode: "Q-AUDIT-CONTACT-CHANNEL", value: true },
          { questionCode: "Q-AUDIT-HOSTING-REGION", value: "INDIA_ONLY" },
          { questionCode: "Q-AUDIT-INFORMAL-CHANNELS", value: false },
          { questionCode: "Q-AUDIT-SYSTEMS-MAPPED", value: true },
          { questionCode: "Q-BIZ-MODEL", value: "B2C" },
          { questionCode: "Q-DATA-VOLUME", value: "10K_TO_100K" },
          { questionCode: "Q-DATA-CATEGORIES", value: "CONTACT" },
          { questionCode: "Q-CHILDREN-DATA", value: false },
          { questionCode: "Q-CROSS-BORDER", value: false },
          { questionCode: "Q-FIDUCIARY-ROLE", value: "FIDUCIARY" },
          { questionCode: "Q-NOTICE-PUBLISHED", value: true },
          { questionCode: "Q-NOTICE-PURPOSE", value: true },
          { questionCode: "Q-CONSENT-COLLECT", value: true },
          { questionCode: "Q-CONSENT-WITHDRAW", value: true },
          { questionCode: "Q-CONSENT-MANAGER", value: false },
          { questionCode: "Q-RIGHTS-ACCESS", value: true },
          { questionCode: "Q-RIGHTS-CORRECT", value: true },
          { questionCode: "Q-RIGHTS-DELETE", value: true },
          { questionCode: "Q-RIGHTS-NOMINATION", value: false },
          { questionCode: "Q-GRIEVANCE", value: true },
          { questionCode: "Q-GRIEVANCE-SLA", value: true },
          { questionCode: "Q-VENDORS", value: true },
          { questionCode: "Q-DPA", value: true },
          { questionCode: "Q-VENDOR-INVENTORY", value: true },
          { questionCode: "Q-RETENTION", value: true },
          { questionCode: "Q-RETENTION-ERASURE", value: true },
          { questionCode: "Q-BREACH-PROCESS", value: true },
          { questionCode: "Q-BREACH-NOTIFY", value: true },
          { questionCode: "Q-LOG-RETENTION", value: true },
          { questionCode: "Q-PRIVACY-OWNER", value: true },
          { questionCode: "Q-TRAINING", value: false },
          { questionCode: "Q-SDF", value: false },
        ],
      })
      .expect(200);

    const tokenRes = await request(app)
      .post(`/api/v1/assessments/${assessmentId}/cli/tokens`)
      .set("Authorization", auth)
      .send({ label: "spine-test" })
      .expect(201);
    cliToken = tokenRes.body.data.token as string;
    expect(cliToken.startsWith("dpdp_")).toBe(true);
    expect(tokenRes.body.data.instructions).toBeTruthy();

    const scan = await request(app)
      .post(`/api/v1/assessments/${assessmentId}/cli/scans`)
      .set("Authorization", `Bearer ${cliToken}`)
      .send({
        targetType: "MIXED",
        targetPath: "/tmp/demo-app",
        cliVersion: "0.1.0",
      })
      .expect(201);
    scanJobId = scan.body.data.id as string;

    const batch = await request(app)
      .post(`/api/v1/assessments/${assessmentId}/cli/evidence/batch`)
      .set("Authorization", `Bearer ${cliToken}`)
      .send({
        scanJobId,
        findings: [
          {
            sourceType: "CODE",
            location: "src/routes/account.ts:42",
            findingType: "deletion_endpoint",
            excerpt: "router.delete('/account', eraseUser)",
            confidence: 0.95,
            controlCandidates: ["DPDP-RIGHTS-ERASURE"],
          },
          {
            sourceType: "CODE",
            location: "src/routes/consent.ts:18",
            findingType: "consent_withdrawal",
            excerpt: "app.post('/consent/withdraw', withdrawConsent)",
            confidence: 0.93,
            controlCandidates: ["DPDP-CONSENT-WITHDRAW"],
          },
          {
            sourceType: "CONFIG",
            location: ".env:12",
            findingType: "retention_config",
            excerpt: "LOG_RETENTION_DAYS=365",
            confidence: 0.9,
            controlCandidates: ["DPDP-RETENTION-LOGS"],
          },
        ],
      })
      .expect(201);
    expect(batch.body.data.findingsAccepted).toBe(3);

    const evaluated = await request(app)
      .post(`/api/v1/assessments/${assessmentId}/controls/evaluate`)
      .set("Authorization", auth)
      .send({})
      .expect(200);
    expect(typeof evaluated.body.data.score).toBe("number");
    expect(evaluated.body.data.scoreKind).toBe("READINESS");
    expect(evaluated.body.data.summary.disclaimer).toBeTruthy();
    expect(evaluated.body.data.results.length).toBeGreaterThan(5);
    expect(typeof evaluated.body.data.openedViolations).toBe("number");

    const report = await request(app)
      .get(`/api/v1/assessments/${assessmentId}/report`)
      .set("Authorization", auth)
      .expect(200);
    expect(report.body.data.summary).toBeTruthy();
    expect(report.body.data.scoreKind).toBe("READINESS");
    expect(report.body.data.version).toBe(1);

    const version = await request(app)
      .post(`/api/v1/assessments/${assessmentId}/versions`)
      .set("Authorization", auth)
      .send({ label: "v2-after-fixes" })
      .expect(201);
    expect(version.body.data.versionNumber).toBe(2);
    expect(version.body.data.frozenFromVersion).toBe(1);
    expect(version.body.data.snapshotJson).toBeTruthy();

    const audit = await request(app)
      .get(`/api/v1/assessments/${assessmentId}/audit`)
      .set("Authorization", auth)
      .expect(200);
    const events = audit.body.data as Array<{
      eventHash: string;
      prevEventHash: string | null;
    }>;
    expect(events.length).toBeGreaterThan(3);
    expect(events[1]!.prevEventHash).toBe(events[0]!.eventHash);
  });
});
