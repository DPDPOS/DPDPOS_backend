import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHash, randomUUID } from "node:crypto";
import request from "supertest";

import { createApp } from "../../src/app.js";
import { prisma } from "../../src/infrastructure/database/prisma-client.js";
import {
  connectRedis,
  disconnectRedis,
} from "../../src/infrastructure/cache/redis-client.js";
import { signAccessToken } from "../../src/modules/auth/utils/jwt.js";
import { ALL_PERMISSIONS } from "../../src/shared/constants/permissions.js";
import { deleteTestOrganizations } from "../../src/test-utils/cleanup-organizations.js";
import { generateTestCsr } from "../../src/test-utils/agent-crypto.js";

function authHeader(organizationId: string, userId = randomUUID()): string {
  return `Bearer ${signAccessToken({
    actorUserId: userId,
    organizationId,
    roles: ["ORG_ADMIN"],
    permissions: [...ALL_PERMISSIONS],
    jti: randomUUID(),
  })}`;
}

function reportHash(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

describe("Control Plane HTTP architecture", () => {
  const app = createApp();
  let organizationId = "";
  let userId = "";
  let enrollmentToken = "";
  let agentId = "";
  let certSerial = "";
  let dsrId = "";

  beforeAll(async () => {
    await prisma.$connect();
    await connectRedis();
    const org = await request(app)
      .post("/api/v1/organizations")
      .send({ name: `CP Org ${Date.now()}` })
      .expect(201);
    organizationId = org.body.data.organization.id as string;
    userId = randomUUID();
  }, 60_000);

  afterAll(async () => {
    if (organizationId) await deleteTestOrganizations([organizationId]);
    await disconnectRedis();
    await prisma.$disconnect();
  });

  it("1) onboarding intake issues enrollment token + plugin bundle", async () => {
    const auth = authHeader(organizationId, userId);
    const res = await request(app)
      .post("/api/v1/onboarding/intake")
      .set("Authorization", auth)
      .send({
        deploymentTier: "ENTERPRISE",
        networkScope: { vpcCidrs: ["10.0.0.0/16"], k8sNamespaces: ["dpdpos"] },
        tprmVendors: [{ name: "Salesforce", systemType: "salesforce" }],
        declaredPurposes: ["Payroll", "Hiring"],
        declaredSystems: ["postgres", "salesforce"],
        zoneName: "vpc-a",
      })
      .expect(201);

    expect(res.body.data.enrollmentToken).toMatch(/^agent_enroll_/);
    expect(res.body.data.requiredPlugins).toEqual(
      expect.arrayContaining(["postgres", "salesforce", "vendor-scanner"]),
    );
    expect(res.body.data.installCommand).toContain("--token");
    enrollmentToken = res.body.data.enrollmentToken as string;

    const settings = await prisma.organizationControlPlaneSettings.findUnique({
      where: { organizationId },
    });
    expect(settings?.deploymentTier).toBe("ENTERPRISE");
    expect(settings?.discoveryEnabled).toBe(true);
  });

  it("2) agent enrolls with CSR and receives client cert", async () => {
    const { csrPem } = generateTestCsr(`agent-${Date.now()}`);
    const res = await request(app)
      .post("/api/v1/agents/enroll")
      .send({
        enrollmentToken,
        csrPem,
        agentName: "zone-a-1",
        agentVersion: "0.1.0-test",
        zoneName: "vpc-a",
        platform: "linux",
        capabilities: ["postgres", "discovery"],
      })
      .expect(201);

    expect(res.body.data.agentId).toBeTruthy();
    expect(res.body.data.clientCertPem).toContain("BEGIN CERTIFICATE");
    expect(res.body.data.caCertPem).toContain("BEGIN CERTIFICATE");
    agentId = res.body.data.agentId as string;

    const cert = await prisma.agentCertificate.findFirst({
      where: { agentId },
    });
    expect(cert?.serialNumber).toBeTruthy();
    certSerial = cert!.serialNumber;

    // Single-use token should fail on reuse
    await request(app)
      .post("/api/v1/agents/enroll")
      .send({
        enrollmentToken,
        csrPem: generateTestCsr("reuse").csrPem,
        agentVersion: "0.1.0",
      })
      .expect(401);
  });

  it("3) heartbeat ack + empty task, then task piggyback", async () => {
    const empty = await request(app)
      .post("/api/v1/agents/heartbeat")
      .set("Authorization", `Bearer agent_dev_${agentId}`)
      .send({ targetHealth: "HEALTHY", version: "0.1.0-test" })
      .expect(200);
    expect(empty.body.data.ack).toBe(true);

    const agent = await prisma.agent.findUnique({ where: { id: agentId } });
    expect(agent?.state).toBe("ACTIVE");
    expect(agent?.lastHeartbeatAt).toBeTruthy();

    await prisma.agentTask.create({
      data: {
        organizationId,
        agentId,
        type: "DISCOVERY",
        dedupeKey: `discovery-on-demand:${agentId}:${Date.now()}`,
        payloadJson: { reason: "test" },
        status: "PENDING",
        availableAt: new Date(),
      },
    });

    const withTask = await request(app)
      .post("/api/v1/agents/heartbeat")
      .set("X-Agent-Id", agentId)
      .set("X-Client-Cert-Serial", certSerial)
      .send({ targetHealth: "HEALTHY" })
      .expect(200);
    expect(withTask.body.data.task?.type).toBe("DISCOVERY");
  });

  it("4) discovery ingest creates catalog + unmapped system finding", async () => {
    const systems = [
      {
        externalId: "sf-prod",
        name: "Salesforce CRM Prod",
        systemType: "SAAS" as const,
        connectorKey: "salesforce",
        assets: [
          {
            externalId: "contact",
            name: "Contact",
            assetType: "TABLE" as const,
            fields: [
              {
                externalId: "email",
                name: "Email",
                pii: true,
                piiCategory: "EMAIL",
                confidence: 0.95,
                isIdentifier: true,
                identityHashes: [
                  createHash("sha256").update("user@example.com").digest("hex"),
                ],
              },
            ],
          },
        ],
      },
    ];
    const body = {
      schemaVersion: "1.0" as const,
      reportId: randomUUID(),
      agentId,
      revision: 1,
      discoveredAt: new Date().toISOString(),
      reportHash: "0".repeat(64),
      systems,
    };
    body.reportHash = reportHash({ ...body, reportHash: undefined });

    const res = await request(app)
      .post("/api/v1/agents/discovery")
      .set("Authorization", `Bearer agent_dev_${agentId}`)
      .send(body)
      .expect(202);

    expect(res.body.data.revisionId || res.body.data.catalogRevisionId || res.body.success).toBeTruthy();

    const system = await prisma.dataSystem.findFirst({
      where: { organizationId, externalId: "sf-prod" },
    });
    expect(system).toBeTruthy();

    const finding = await prisma.complianceFinding.findFirst({
      where: {
        organizationId,
        ruleCode: { in: ["VLD-UNMAPPED-SYSTEM", "VLD-PII-NO-BASIS"] },
      },
    });
    expect(finding).toBeTruthy();
  });

  it("5) openOrDedupe keeps a single OPEN violation across sources", async () => {
    const auth = authHeader(organizationId, userId);
    // Seed a finding-backed violation via service path exercised by validation later;
    // also assert CLI assessment path still works on a fresh assessment if needed.
    const { violationService } = await import(
      "../../src/modules/violations/services/violation.service.js"
    );
    const ctx = {
      correlationId: randomUUID(),
      organizationId,
      actorUserId: userId,
      permissions: [...ALL_PERMISSIONS],
      roles: ["ORG_ADMIN"],
    };
    const first = await violationService.openOrDedupe(ctx, {
      findingSource: "AGENT",
      ruleOrControlCode: "VLD-UNMAPPED-SYSTEM",
      entityType: "DataSystem",
      entityId: "sf-prod",
      severity: "HIGH",
      title: "Unmapped Salesforce",
      description: "from agent",
    });
    expect(first.created).toBe(true);

    const second = await violationService.openOrDedupe(ctx, {
      findingSource: "VALIDATION",
      ruleOrControlCode: "VLD-UNMAPPED-SYSTEM",
      entityType: "DataSystem",
      entityId: "sf-prod",
      severity: "HIGH",
      title: "Unmapped Salesforce (validation)",
    });
    expect(second.created).toBe(false);
    expect(second.violation.id).toBe(first.violation.id);

    const listed = await request(app)
      .get("/api/v1/violations")
      .query({ findingSource: "AGENT" })
      .set("Authorization", auth)
      .expect(200);
    expect(
      (listed.body.data as Array<{ id: string }>).some(
        (v) => v.id === first.violation.id,
      ),
    ).toBe(true);
  });

  it("6) consent snapshot + withdraw queues invalidation for heartbeat", async () => {
    const auth = authHeader(organizationId, userId);
    const notice = await request(app)
      .post("/api/v1/notices")
      .set("Authorization", auth)
      .send({
        title: "CP Notice",
        content: "Test privacy notice for control plane consent flow.",
      })
      .expect(201);

    const asset = await request(app)
      .post("/api/v1/data-assets")
      .set("Authorization", auth)
      .send({
        assetName: "Marketing DB",
        assetType: "DATABASE",
        category: "CUSTOMER",
        sensitivity: "HIGH",
      })
      .expect(201);

    const consent = await request(app)
      .post("/api/v1/consent-records")
      .set("Authorization", auth)
      .send({
        noticeId: notice.body.data.id,
        dataAssetId: asset.body.data.id,
        dataSubjectIdentifier: "principal-4971",
        purpose: "marketing",
      })
      .expect(201);

    await request(app)
      .post(`/api/v1/consent-records/${consent.body.data.id}/withdraw`)
      .set("Authorization", auth)
      .expect(200);

    const snap = await request(app)
      .get("/api/v1/agents/consent/snapshot")
      .set("Authorization", `Bearer agent_dev_${agentId}`)
      .expect(200);
    expect(Array.isArray(snap.body.data.records ?? snap.body.data)).toBe(true);

    const hb = await request(app)
      .post("/api/v1/agents/heartbeat")
      .set("Authorization", `Bearer agent_dev_${agentId}`)
      .send({ targetHealth: "HEALTHY" })
      .expect(200);
    expect(Array.isArray(hb.body.data.pendingInvalidations)).toBe(true);
  });

  it("7) DSR + agent erasure dispatch status endpoint", async () => {
    const auth = authHeader(organizationId, userId);
    await prisma.organizationControlPlaneSettings.update({
      where: { organizationId },
      data: { dsrDispatchEnabled: true },
    });

    const dsr = await request(app)
      .post("/api/v1/data-subject-requests")
      .set("Authorization", auth)
      .send({
        requestType: "ERASURE",
        requesterReference: "user@example.com",
      })
      .expect(201);
    dsrId = dsr.body.data.id as string;

    await request(app)
      .post(`/api/v1/data-subject-requests/${dsrId}/erasure-dispatch-agents`)
      .set("Authorization", auth)
      .expect(202);

    const status = await request(app)
      .get(`/api/v1/data-subject-requests/${dsrId}/erasure-saga-status`)
      .set("Authorization", auth)
      .expect(200);

    expect(status.body.data).toMatchObject({
      total: expect.any(Number),
      completed: expect.any(Number),
    });
  });

  it("8) evidence ledger verify endpoint", async () => {
    const auth = authHeader(organizationId, userId);
    const { evidenceLedgerService } = await import(
      "../../src/modules/ledger/services/evidence-ledger.service.js"
    );
    await evidenceLedgerService.appendEvent({
      organizationId,
      eventType: "AGENT_ENROLLED",
      actorType: "SYSTEM",
      objectType: "Agent",
      objectId: agentId,
      payload: { agentId },
    });

    const verify = await request(app)
      .get("/api/v1/ledger/verify")
      .set("Authorization", auth)
      .expect(200);
    expect(verify.body.data.valid).toBe(true);
    expect(verify.body.data.entryCount).toBeGreaterThan(0);
  });

  it("9) plugin manifest for agent is an array", async () => {
    const res = await request(app)
      .get("/api/v1/agents/plugins/manifest")
      .set("Authorization", `Bearer agent_dev_${agentId}`)
      .expect(200);
    expect(Array.isArray(res.body.data.plugins ?? res.body.data)).toBe(true);
  });

  it("10) JWT agent fleet list includes enrolled agent", async () => {
    const auth = authHeader(organizationId, userId);
    const res = await request(app)
      .get("/api/v1/agents")
      .set("Authorization", auth)
      .expect(200);
    const agents = res.body.data as Array<{ id: string }>;
    expect(agents.some((a) => a.id === agentId)).toBe(true);
  });
});
