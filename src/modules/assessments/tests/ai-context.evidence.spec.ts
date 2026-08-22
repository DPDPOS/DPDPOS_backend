import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { createApp } from "../../../app.js";
import { prisma } from "../../../infrastructure/database/prisma-client.js";
import { signAccessToken } from "../../auth/utils/jwt.js";
import { ALL_PERMISSIONS } from "../../../shared/constants/permissions.js";
import { deleteTestOrganizations } from "../../../test-utils/cleanup-organizations.js";

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

/** Valid aiContext fixture for reuse across tests. */
function validAiContext() {
  return {
    classifiedAt: new Date().toISOString(),
    provider: "groq",
    model: "allam-2-7b",
    classifications: [
      {
        location: "src/routes/account.ts:42",
        findingType: "deletion_endpoint",
        classification: "positive_evidence" as const,
        reasoning: "Deletion endpoint found for user account erasure",
        confidence: 0.95,
      },
      {
        location: "src/routes/consent.ts:18",
        findingType: "consent_withdrawal",
        classification: "positive_evidence" as const,
        reasoning: "Consent withdrawal endpoint present",
        confidence: 0.93,
      },
      {
        location: ".env:12",
        findingType: "retention_config",
        classification: "reference_only" as const,
        reasoning: "Retention config present but cannot confirm enforcement",
        confidence: 0.7,
      },
    ],
  };
}

/** Valid findings fixture for reuse across tests. */
function validFindings() {
  return [
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
  ];
}

describe("AI context in CLI evidence batch submission", () => {
  const app = createApp();
  let organizationId = "";
  let userId = "";
  let assessmentId = "";
  let cliToken = "";

  beforeAll(async () => {
    await prisma.$connect();
    const org = await request(app)
      .post("/api/v1/organizations")
      .send({ name: `AI Context Test Org ${Date.now()}` })
      .expect(201);
    organizationId = org.body.data.organization.id as string;
    userId = randomUUID();

    // Create assessment
    const auth = authHeader(organizationId, userId);
    const created = await request(app)
      .post("/api/v1/assessments")
      .set("Authorization", auth)
      .send({ name: "AI Context Test Assessment" })
      .expect(201);
    assessmentId = created.body.data.id as string;

    // Upload a document (required for evaluate)
    await request(app)
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

    // Answer required questionnaire (matches compliance-spine.http.spec.ts)
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

    // Create CLI token
    const tokenRes = await request(app)
      .post(`/api/v1/assessments/${assessmentId}/cli/tokens`)
      .set("Authorization", auth)
      .send({ label: "ai-context-test" })
      .expect(201);
    cliToken = tokenRes.body.data.token as string;
  });

  afterAll(async () => {
    if (!organizationId) {
      await prisma.$disconnect();
      return;
    }
    await deleteTestOrganizations([organizationId]);
    await prisma.$disconnect();
  });

  // --- Helper to create a scan job ---
  async function createScan(): Promise<string> {
    const scan = await request(app)
      .post(`/api/v1/assessments/${assessmentId}/cli/scans`)
      .set("Authorization", `Bearer ${cliToken}`)
      .send({
        targetType: "MIXED",
        targetPath: "/tmp/test-app",
        cliVersion: "0.2.0",
      })
      .expect(201);
    return scan.body.data.id as string;
  }

  // =========================================================================
  // A. Existing submission WITHOUT aiContext still succeeds
  // =========================================================================
  it("A. submits evidence batch WITHOUT aiContext", async () => {
    const scanJobId = await createScan();

    const batch = await request(app)
      .post(`/api/v1/assessments/${assessmentId}/cli/evidence/batch`)
      .set("Authorization", `Bearer ${cliToken}`)
      .send({
        scanJobId,
        findings: validFindings(),
      })
      .expect(201);

    expect(batch.body.data.findingsAccepted).toBe(3);
    expect(batch.body.data.status).toBe("COMPLETED");

    // Verify aiContext is null on the scan job
    const job = await prisma.scanJob.findUnique({ where: { id: scanJobId } });
    expect(job).not.toBeNull();
    expect(job!.aiContext).toBeNull();
  });

  // =========================================================================
  // B. Submission WITH valid aiContext succeeds and is stored
  // =========================================================================
  it("B. submits evidence batch WITH valid aiContext", async () => {
    const scanJobId = await createScan();

    const batch = await request(app)
      .post(`/api/v1/assessments/${assessmentId}/cli/evidence/batch`)
      .set("Authorization", `Bearer ${cliToken}`)
      .send({
        scanJobId,
        findings: validFindings(),
        aiContext: validAiContext(),
      })
      .expect(201);

    expect(batch.body.data.findingsAccepted).toBe(3);
    expect(batch.body.data.status).toBe("COMPLETED");

    // Verify aiContext is stored on the scan job
    const job = await prisma.scanJob.findUnique({ where: { id: scanJobId } });
    expect(job).not.toBeNull();
    expect(job!.aiContext).not.toBeNull();

    const stored = job!.aiContext as Record<string, unknown>;
    expect(stored.provider).toBe("groq");
    expect(stored.model).toBe("allam-2-7b");
    expect(Array.isArray(stored.classifications)).toBe(true);
    expect((stored.classifications as unknown[]).length).toBe(3);
  });

  // =========================================================================
  // C. Retrieved scan contains aiContext
  // =========================================================================
  it("C. getScan returns aiContext", async () => {
    const scanJobId = await createScan();

    // Submit with aiContext
    await request(app)
      .post(`/api/v1/assessments/${assessmentId}/cli/evidence/batch`)
      .set("Authorization", `Bearer ${cliToken}`)
      .send({
        scanJobId,
        findings: validFindings(),
        aiContext: validAiContext(),
      })
      .expect(201);

    // Get scan via CLI endpoint
    const getRes = await request(app)
      .get(`/api/v1/assessments/${assessmentId}/cli/scans/${scanJobId}`)
      .set("Authorization", `Bearer ${cliToken}`)
      .expect(200);

    expect(getRes.body.data.aiContext).not.toBeNull();
    expect(getRes.body.data.aiContext.provider).toBe("groq");
    expect(getRes.body.data.aiContext.model).toBe("allam-2-7b");
  });

  // =========================================================================
  // D. Listed scans contain aiContext
  // =========================================================================
  it("D. listScans returns aiContext", async () => {
    const scanJobId = await createScan();

    // Submit with aiContext
    await request(app)
      .post(`/api/v1/assessments/${assessmentId}/cli/evidence/batch`)
      .set("Authorization", `Bearer ${cliToken}`)
      .send({
        scanJobId,
        findings: validFindings(),
        aiContext: validAiContext(),
      })
      .expect(201);

    // List scans via JWT endpoint
    const auth = authHeader(organizationId, userId);
    const listRes = await request(app)
      .get(`/api/v1/assessments/${assessmentId}/cli/scans`)
      .set("Authorization", auth)
      .expect(200);

    const jobs = listRes.body.data as Array<{
      id: string;
      aiContext: Record<string, unknown> | null;
    }>;
    const found = jobs.find((j) => j.id === scanJobId);
    expect(found).toBeDefined();
    expect(found!.aiContext).not.toBeNull();
    expect(found!.aiContext!.provider).toBe("groq");
  });

  // =========================================================================
  // E. Invalid classification enum rejected
  // =========================================================================
  it("E. rejects invalid classification enum", async () => {
    const scanJobId = await createScan();

    await request(app)
      .post(`/api/v1/assessments/${assessmentId}/cli/evidence/batch`)
      .set("Authorization", `Bearer ${cliToken}`)
      .send({
        scanJobId,
        findings: validFindings(),
        aiContext: {
          ...validAiContext(),
          classifications: [
            {
              location: "src/test.ts:1",
              findingType: "test",
              classification: "INVALID_VALUE", // bad enum
              reasoning: "test",
              confidence: 0.5,
            },
          ],
        },
      })
      .expect(400); // validation error
  });

  // =========================================================================
  // F. Invalid confidence rejected
  // =========================================================================
  it("F. rejects invalid confidence outside 0..1", async () => {
    const scanJobId = await createScan();

    await request(app)
      .post(`/api/v1/assessments/${assessmentId}/cli/evidence/batch`)
      .set("Authorization", `Bearer ${cliToken}`)
      .send({
        scanJobId,
        findings: validFindings(),
        aiContext: {
          ...validAiContext(),
          classifications: [
            {
              location: "src/test.ts:1",
              findingType: "test",
              classification: "positive_evidence",
              reasoning: "test",
              confidence: 1.5, // out of range
            },
          ],
        },
      })
      .expect(400);
  });

  // =========================================================================
  // G. Oversized aiContext rejected (too many classifications)
  // =========================================================================
  it("G. rejects aiContext with > 5000 classifications", async () => {
    const scanJobId = await createScan();

    const oversizedClassifications = Array.from({ length: 5001 }, (_, i) => ({
      location: `file${i}.ts:${i}`,
      findingType: "test",
      classification: "positive_evidence" as const,
      reasoning: `classification ${i}`,
      confidence: 0.5,
    }));

    await request(app)
      .post(`/api/v1/assessments/${assessmentId}/cli/evidence/batch`)
      .set("Authorization", `Bearer ${cliToken}`)
      .send({
        scanJobId,
        findings: validFindings(),
        aiContext: {
          classifiedAt: new Date().toISOString(),
          provider: "groq",
          model: "allam-2-7b",
          classifications: oversizedClassifications,
        },
      })
      .expect(400);
  });

  // =========================================================================
  // H. Existing deterministic evaluation remains unchanged
  // =========================================================================
  it("H. deterministic evaluation is unchanged by aiContext", async () => {
    // Run evaluate on assessment that has findings + no aiContext influence
    const auth = authHeader(organizationId, userId);

    const evaluated = await request(app)
      .post(`/api/v1/assessments/${assessmentId}/controls/evaluate`)
      .set("Authorization", auth)
      .send({})
      .expect(200);

    expect(typeof evaluated.body.data.score).toBe("number");
    expect(evaluated.body.data.scoreKind).toBe("READINESS");

    // Verify the control engine produced deterministic results
    const results = evaluated.body.data.results as Array<{
      controlCode: string;
      status: string;
    }>;
    expect(results.length).toBeGreaterThan(5);

    // Every control has a valid status
    const validStatuses = [
      "PASS",
      "PARTIAL",
      "FAIL",
      "UNKNOWN",
      "NOT_APPLICABLE",
    ];
    for (const r of results) {
      expect(validStatuses).toContain(r.status);
    }
  });

  // =========================================================================
  // I. Existing CLI evidence findings remain unchanged
  // =========================================================================
  it("I. evidence findings are stored correctly with aiContext", async () => {
    const scanJobId = await createScan();

    const findings = validFindings();

    await request(app)
      .post(`/api/v1/assessments/${assessmentId}/cli/evidence/batch`)
      .set("Authorization", `Bearer ${cliToken}`)
      .send({
        scanJobId,
        findings,
        aiContext: validAiContext(),
      })
      .expect(201);

    // Verify all findings were stored correctly in cli_findings
    const dbFindings = await prisma.cliFinding.findMany({
      where: { scanJobId },
      orderBy: { location: "asc" },
    });

    expect(dbFindings.length).toBe(3);

    // Verify finding fields are unchanged
    const sortedFindings = [...findings].sort((a, b) =>
      a.location.localeCompare(b.location),
    );
    for (let i = 0; i < dbFindings.length; i++) {
      expect(dbFindings[i]!.sourceType).toBe(sortedFindings[i]!.sourceType);
      expect(dbFindings[i]!.location).toBe(sortedFindings[i]!.location);
      expect(dbFindings[i]!.findingType).toBe(sortedFindings[i]!.findingType);
      expect(dbFindings[i]!.confidence).toBe(sortedFindings[i]!.confidence);
    }
  });

  // =========================================================================
  // CRITICAL: aiContext has zero impact on evaluation output
  // =========================================================================
  it("critical invariant: same findings produce identical evaluation with or without aiContext", async () => {
    // Create two separate assessments for comparison
    const auth = authHeader(organizationId, userId);

    // --- Assessment WITHOUT aiContext ---
    const org1 = await request(app)
      .post("/api/v1/organizations")
      .send({ name: `Invariant Org A ${Date.now()}` })
      .expect(201);
    const orgId1 = org1.body.data.organization.id as string;
    const uid1 = randomUUID();
    const auth1 = authHeader(orgId1, uid1);

    const assessment1 = await request(app)
      .post("/api/v1/assessments")
      .set("Authorization", auth1)
      .send({ name: "Invariant A" })
      .expect(201);
    const aid1 = assessment1.body.data.id as string;

    await setupAssessment(app, auth1, aid1);
    const cliToken1 = await createCliTokenForTest(app, auth1, aid1);

    const scan1 = await request(app)
      .post(`/api/v1/assessments/${aid1}/cli/scans`)
      .set("Authorization", `Bearer ${cliToken1}`)
      .send({ targetType: "MIXED", targetPath: "/tmp/a", cliVersion: "0.2.0" })
      .expect(201);

    // Submit WITHOUT aiContext
    await request(app)
      .post(`/api/v1/assessments/${aid1}/cli/evidence/batch`)
      .set("Authorization", `Bearer ${cliToken1}`)
      .send({ scanJobId: scan1.body.data.id, findings: validFindings() })
      .expect(201);

    const eval1 = await request(app)
      .post(`/api/v1/assessments/${aid1}/controls/evaluate`)
      .set("Authorization", auth1)
      .send({})
      .expect(200);

    // --- Assessment WITH aiContext ---
    const org2 = await request(app)
      .post("/api/v1/organizations")
      .send({ name: `Invariant Org B ${Date.now()}` })
      .expect(201);
    const orgId2 = org2.body.data.organization.id as string;
    const uid2 = randomUUID();
    const auth2 = authHeader(orgId2, uid2);

    const assessment2 = await request(app)
      .post("/api/v1/assessments")
      .set("Authorization", auth2)
      .send({ name: "Invariant B" })
      .expect(201);
    const aid2 = assessment2.body.data.id as string;

    await setupAssessment(app, auth2, aid2);
    const cliToken2 = await createCliTokenForTest(app, auth2, aid2);

    const scan2 = await request(app)
      .post(`/api/v1/assessments/${aid2}/cli/scans`)
      .set("Authorization", `Bearer ${cliToken2}`)
      .send({ targetType: "MIXED", targetPath: "/tmp/b", cliVersion: "0.2.0" })
      .expect(201);

    // Submit WITH aiContext
    await request(app)
      .post(`/api/v1/assessments/${aid2}/cli/evidence/batch`)
      .set("Authorization", `Bearer ${cliToken2}`)
      .send({
        scanJobId: scan2.body.data.id,
        findings: validFindings(),
        aiContext: validAiContext(),
      })
      .expect(201);

    const eval2 = await request(app)
      .post(`/api/v1/assessments/${aid2}/controls/evaluate`)
      .set("Authorization", auth2)
      .send({})
      .expect(200);

    // CRITICAL: scores must be identical
    expect(eval1.body.data.score).toBe(eval2.body.data.score);

    // CRITICAL: control statuses must be identical
    const results1 = eval1.body.data.results as Array<{
      controlCode: string;
      status: string;
    }>;
    const results2 = eval2.body.data.results as Array<{
      controlCode: string;
      status: string;
    }>;

    const map1 = new Map(results1.map((r) => [r.controlCode, r.status]));
    const map2 = new Map(results2.map((r) => [r.controlCode, r.status]));

    for (const [code, status1] of map1) {
      const status2 = map2.get(code);
      expect(status2).toBe(status1);
    }

    // Cleanup invariant test orgs
    await deleteTestOrganizations([orgId1, orgId2]);
  });
});

// --- Test helpers ---

async function setupAssessment(
  app: ReturnType<typeof createApp>,
  auth: string,
  assessmentId: string,
): Promise<void> {
  await request(app)
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

  // Answer required questionnaire (matches compliance-spine.http.spec.ts)
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
}

async function createCliTokenForTest(
  app: ReturnType<typeof createApp>,
  auth: string,
  assessmentId: string,
): Promise<string> {
  const tokenRes = await request(app)
    .post(`/api/v1/assessments/${assessmentId}/cli/tokens`)
    .set("Authorization", auth)
    .send({ label: "test-cli" })
    .expect(201);
  return tokenRes.body.data.token as string;
}
