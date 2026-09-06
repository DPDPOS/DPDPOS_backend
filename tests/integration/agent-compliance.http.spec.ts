import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app.js";

describe("DPDP Agent Fleet & SaaS DPO Compliance Control Plane", () => {
  const app = createApp();
  const testTenant = `tenant-test-${Date.now()}`;
  const testAgentId = `agent-vpc-pg-01`;

  it("1. Enrolls in-VPC Zone Agent and returns HMAC token", async () => {
    const res = await request(app)
      .post("/api/v1/agent/enroll")
      .send({
        agentId: testAgentId,
        agentName: "AWS RDS Production Agent",
        version: "1.0.0",
        environment: "production",
        targetType: "POSTGRES",
        targetUriMasked: "postgres://db-prod.internal:5432/enterprise_db",
        tenantId: testTenant,
      })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.agentToken).toBeDefined();
    expect(res.body.heartbeatIntervalSec).toBe(5);
  });

  it("2. Handles outbound agent heartbeat and returns queued tasks", async () => {
    const res = await request(app)
      .post("/api/v1/agent/heartbeat")
      .send({
        agentId: testAgentId,
        tenantId: testTenant,
        status: "ACTIVE",
        timestamp: new Date().toISOString(),
        memoryUsageMb: 42,
      })
      .expect(200);

    expect(res.body.acknowledged).toBe(true);
    expect(Array.isArray(res.body.pendingTasks)).toBe(true);
  });

  it("3. Ingests zero-knowledge discovery report (ISO 27001 A.5.34)", async () => {
    const discoveryPayload = {
      agentId: testAgentId,
      tenantId: testTenant,
      targetId: "target-pg-rds",
      targetType: "POSTGRES",
      targetUriMasked: "postgres://db-prod.internal:5432/enterprise_db",
      timestamp: new Date().toISOString(),
      overallDdlChecksum: "sha256:abcd1234efgh5678",
      tables: [
        {
          tableName: "users",
          rowCountEstimated: 125000,
          ddlChecksum: "sha256:tbl_users",
          columns: [
            { name: "id", dataType: "uuid", isPrimaryKey: true },
            {
              name: "email",
              dataType: "varchar",
              detectedPii: { piiType: "EMAIL", confidence: 0.99, sampleCount: 100, matchCount: 100 },
            },
            {
              name: "aadhaar_number",
              dataType: "varchar",
              detectedPii: { piiType: "AADHAAR", confidence: 1.0, sampleCount: 100, matchCount: 100 },
            },
            {
              name: "phone",
              dataType: "varchar",
              detectedPii: { piiType: "PHONE", confidence: 0.98, sampleCount: 100, matchCount: 98 },
            },
          ],
        },
      ],
    };

    const res = await request(app)
      .post("/api/v1/agent/discovery")
      .send(discoveryPayload)
      .expect(200);

    expect(res.body.success).toBe(true);
  });

  it("4. Evaluates DPDP statutory rules and produces Compliance Scorecard", async () => {
    const res = await request(app)
      .get("/api/v1/compliance/report")
      .set("x-tenant-id", testTenant)
      .expect(200);

    expect(res.body.tenantId).toBe(testTenant);
    expect(res.body.totalPiiFields).toBe(3);
    expect(res.body.unmappedPiiFields).toBeGreaterThan(0);
    expect(res.body.findings.length).toBeGreaterThan(0);
  });

  it("5. Applies 1-Click Remediation to bind PII columns to lawful purpose", async () => {
    // Remediation for email
    const remEmail = await request(app)
      .post("/api/v1/compliance/remediate")
      .set("x-tenant-id", testTenant)
      .send({
        type: "MAP_PURPOSE",
        tableName: "users",
        columnName: "email",
        purposeTags: ["essential"],
      })
      .expect(200);

    // Remediation for phone
    await request(app)
      .post("/api/v1/compliance/remediate")
      .set("x-tenant-id", testTenant)
      .send({
        type: "MAP_PURPOSE",
        tableName: "users",
        columnName: "phone",
        purposeTags: ["essential"],
      })
      .expect(200);

    // Remediation for aadhaar (Purpose + Masking)
    const remAadhaar = await request(app)
      .post("/api/v1/compliance/remediate")
      .set("x-tenant-id", testTenant)
      .send({
        type: "MAP_PURPOSE",
        tableName: "users",
        columnName: "aadhaar_number",
        purposeTags: ["statutory_kyc"],
      })
      .expect(200);

    await request(app)
      .post("/api/v1/compliance/remediate")
      .set("x-tenant-id", testTenant)
      .send({
        type: "ENABLE_MASKING",
        tableName: "users",
        columnName: "aadhaar_number",
      })
      .expect(200);

    const latest = await request(app)
      .get("/api/v1/compliance/report")
      .set("x-tenant-id", testTenant)
      .expect(200);

    expect(latest.body.score).toBe(100);
    expect(latest.body.grade).toBe("A+");
    expect(latest.body.unmappedPiiFields).toBe(0);
    expect(latest.body.findings.length).toBe(0);
  });

  it("6. Manages 3-Stage DSR Lifecycle (Submit -> DPO Approve -> Soft Delete -> Grace Restore)", async () => {
    // Stage 1: Submit DSR
    const submitRes = await request(app)
      .post("/api/v1/dsr/request")
      .set("x-tenant-id", testTenant)
      .send({
        principalId: "cust_user_4499",
        requestType: "ERASURE",
        requestedBy: "CUSTOMER_PORTAL",
        gracePeriodDays: 30,
      })
      .expect(201);

    const dsrId = submitRes.body.request.dsrId;
    expect(dsrId).toBeDefined();
    expect(submitRes.body.request.status).toBe("PENDING_REVIEW");

    // Stage 2: DPO Approves
    const approveRes = await request(app)
      .post(`/api/v1/dsr/${dsrId}/approve`)
      .set("x-tenant-id", testTenant)
      .send({
        dpoUserId: "dpo@enterprise.com",
        notes: "Identity verified; 30-day grace period initiated",
      })
      .expect(200);

    expect(approveRes.body.request.status).toBe("SOFT_DELETED");
    expect(approveRes.body.request.retentionExpiresAt).toBeDefined();

    // Stage 3: Customer cancels erasure by logging in during grace period
    const restoreRes = await request(app)
      .post(`/api/v1/dsr/${dsrId}/restore`)
      .set("x-tenant-id", testTenant)
      .send({
        reason: "Customer authenticated during grace period",
      })
      .expect(200);

    expect(restoreRes.body.request.status).toBe("RESTORED");
  });

  it("7. Records and retrieves ISO 27001 A.8.15 Tamper-Evident Audit Logs", async () => {
    const logsRes = await request(app)
      .get("/api/v1/audit/logs")
      .set("x-tenant-id", testTenant)
      .expect(200);

    expect(Array.isArray(logsRes.body.logs)).toBe(true);
    expect(logsRes.body.logs.length).toBeGreaterThan(0);
    const latest = logsRes.body.logs[0];
    expect(latest.checksum).toBeDefined();
    expect(latest.checksum.length).toBe(64); // SHA-256 HMAC
  });

  it("8. Generates 1-Click Docker deployment command for In-VPC installation", async () => {
    const res = await request(app)
      .get("/api/v1/agent/install-script?dbType=postgres")
      .set("x-tenant-id", testTenant)
      .expect(200);

    expect(res.body.script).toContain("docker run -d --name dpdp-zone-agent");
    expect(res.body.script).toContain("dpdp/zone-agent:latest");
  });
});
