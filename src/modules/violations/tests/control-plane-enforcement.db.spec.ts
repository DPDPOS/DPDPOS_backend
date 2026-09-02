import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHash, randomUUID } from "node:crypto";

import { prisma } from "../../../infrastructure/database/prisma-client.js";
import {
  connectRedis,
  disconnectRedis,
} from "../../../infrastructure/cache/redis-client.js";
import type { RequestContext } from "../../../shared/types/request-context.js";
import { ALL_PERMISSIONS } from "../../../shared/constants/permissions.js";
import { deleteTestOrganizations } from "../../../test-utils/cleanup-organizations.js";
import { ViolationService } from "../services/violation.service.js";

function ctx(organizationId: string, actorUserId = randomUUID()): RequestContext {
  return {
    correlationId: randomUUID(),
    organizationId,
    actorUserId,
    permissions: [...ALL_PERMISSIONS],
    roles: ["ORG_ADMIN"],
  };
}

describe("ViolationService.openOrDedupe (DB)", () => {
  const service = new ViolationService();
  const orgIds: string[] = [];

  beforeAll(async () => {
    await prisma.$connect();
    await connectRedis();
  });

  afterAll(async () => {
    await deleteTestOrganizations(orgIds);
    await disconnectRedis();
    await prisma.$disconnect();
  });

  it("dedupes AGENT and ASSESSMENT openings on the same key", async () => {
    const org = await prisma.organization.create({
      data: { name: `Dedupe Org ${Date.now()}` },
    });
    orgIds.push(org.id);
    const c = ctx(org.id);

    const a = await service.openOrDedupe(c, {
      findingSource: "AGENT",
      ruleOrControlCode: "CTRL-PII-01",
      entityType: "DataAsset",
      entityId: "asset-1",
      severity: "HIGH",
      title: "PII gap from agent",
    });
    expect(a.created).toBe(true);

    const b = await service.openOrDedupe(c, {
      findingSource: "ASSESSMENT",
      ruleOrControlCode: "CTRL-PII-01",
      entityType: "DataAsset",
      entityId: "asset-1",
      severity: "HIGH",
      title: "PII gap from CLI",
      assessmentId: randomUUID(),
    });
    expect(b.created).toBe(false);
    expect(b.violation.id).toBe(a.violation.id);
    expect(b.violation.dedupeKey).toBe("CTRL-PII-01|DataAsset|asset-1");

    const openCount = await prisma.violation.count({
      where: {
        organizationId: org.id,
        status: { in: ["OPEN", "TRIAGE", "ASSIGNED", "IN_PROGRESS"] },
        deletedAt: null,
      },
    });
    expect(openCount).toBe(1);
  });

  it("createFromAssessmentControlFail sets findingSource ASSESSMENT", async () => {
    const org = await prisma.organization.create({
      data: { name: `Assess Vio Org ${Date.now()}` },
    });
    orgIds.push(org.id);
    const assessment = await prisma.assessment.create({
      data: {
        organizationId: org.id,
        name: "Assess for violation bridge",
        status: "DRAFT",
        currentVersion: 1,
      },
    });
    const c = ctx(org.id);

    const v = await service.createFromAssessmentControlFail(c, {
      assessmentId: assessment.id,
      assessmentName: "Test",
      versionNumber: 1,
      controlCode: "CTRL-NOTICE-01",
      severity: "HIGH",
      reasoning: "Missing notice evidence",
    });
    expect(v).toBeTruthy();
    expect(v!.findingSource).toBe("ASSESSMENT");

    const again = await service.createFromAssessmentControlFail(c, {
      assessmentId: assessment.id,
      assessmentName: "Test",
      versionNumber: 1,
      controlCode: "CTRL-NOTICE-01",
      severity: "HIGH",
      reasoning: "Missing notice evidence",
    });
    expect(again!.id).toBe(v!.id);
  });
});

describe("Evidence ledger hash chain (DB)", () => {
  const orgIds: string[] = [];

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await deleteTestOrganizations(orgIds);
    await prisma.$disconnect();
  });

  it("append + verifyIntegrity succeeds", async () => {
    const { evidenceLedgerService } = await import(
      "../../ledger/services/evidence-ledger.service.js"
    );
    const org = await prisma.organization.create({
      data: { name: `Ledger Org ${Date.now()}` },
    });
    orgIds.push(org.id);

    await evidenceLedgerService.appendEvent({
      organizationId: org.id,
      eventType: "TEST_EVENT",
      actorType: "SYSTEM",
      objectType: "Org",
      objectId: org.id,
      payload: { n: 1 },
    });
    await evidenceLedgerService.appendEvent({
      organizationId: org.id,
      eventType: "TEST_EVENT",
      actorType: "SYSTEM",
      objectType: "Org",
      objectId: org.id,
      payload: { n: 2 },
    });

    const result = await evidenceLedgerService.verifyIntegrity(org.id);
    expect(result.valid).toBe(true);
    expect(result.entryCount).toBe(2);
  });
});

describe("Catalog ingestion findings (DB)", () => {
  const orgIds: string[] = [];

  beforeAll(async () => {
    await prisma.$connect();
    await connectRedis();
  });

  afterAll(async () => {
    await deleteTestOrganizations(orgIds);
    await disconnectRedis();
    await prisma.$disconnect();
  });

  it("ingests discovery and upserts ComplianceFinding for unmapped system", async () => {
    const { catalogIngestionService } = await import(
      "../../../control-plane/catalog-ingestion.service.js"
    );
    const org = await prisma.organization.create({
      data: { name: `Catalog Org ${Date.now()}` },
    });
    orgIds.push(org.id);

    await prisma.organizationControlPlaneSettings.create({
      data: {
        organizationId: org.id,
        discoveryEnabled: true,
        deploymentTier: "ENTERPRISE",
      },
    });

    const agent = await prisma.agent.create({
      data: {
        organizationId: org.id,
        name: "ingest-agent",
        state: "ACTIVE",
        agentVersion: "test",
        instanceKey: randomUUID(),
      },
    });

    const systems = [
      {
        externalId: "pg-main",
        name: "Postgres Main",
        systemType: "DATABASE" as const,
        assets: [
          {
            externalId: "users",
            name: "users",
            assetType: "TABLE" as const,
            fields: [
              {
                externalId: "email",
                name: "email",
                pii: true,
                confidence: 0.99,
                isIdentifier: true,
                identityHashes: [
                  createHash("sha256").update("a@b.com").digest("hex"),
                ],
              },
            ],
          },
        ],
      },
    ];

    const report = {
      schemaVersion: "1.0",
      reportId: randomUUID(),
      agentId: agent.id,
      revision: 1,
      discoveredAt: new Date().toISOString(),
      reportHash: createHash("sha256").update("x").digest("hex"),
      systems,
    };

    await catalogIngestionService.ingestDiscoveryReport(
      {
        agentId: agent.id,
        organizationId: org.id,
        zoneName: "default",
        correlationId: randomUUID(),
      },
      report,
    );

    const system = await prisma.dataSystem.findFirst({
      where: { organizationId: org.id, externalId: "pg-main" },
    });
    expect(system).toBeTruthy();

    const findings = await prisma.complianceFinding.findMany({
      where: { organizationId: org.id },
    });
    expect(findings.length).toBeGreaterThan(0);
    expect(findings.some((f) => f.ruleCode === "VLD-UNMAPPED-SYSTEM")).toBe(
      true,
    );
  });
});
