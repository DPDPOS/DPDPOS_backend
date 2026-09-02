/**
 * Independent architecture smoke (NOT vitest).
 * Exercises Control Plane APIs over HTTP against a running server.
 *
 * Usage:
 *   node --env-file=.env --import tsx scripts/smoke-control-plane.mjs
 * or with API already on :3000:
 *   node --env-file=.env scripts/smoke-control-plane.mjs
 */
import { createHash, generateKeyPairSync, randomUUID, sign } from "node:crypto";

const BASE = process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:3000";

function fail(step, detail) {
  console.error(`FAIL [${step}]`, detail);
  process.exitCode = 1;
  throw new Error(String(detail));
}

function ok(step, extra = "") {
  console.log(`OK   [${step}]${extra ? ` ${extra}` : ""}`);
}

async function api(method, path, { token, agentId, serial, body, expectStatus } = {}) {
  const headers = { "content-type": "application/json" };
  if (token) headers.authorization = token.startsWith("Bearer ") ? token : `Bearer ${token}`;
  if (agentId) headers["x-agent-id"] = agentId;
  if (serial) headers["x-client-cert-serial"] = serial;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (expectStatus && res.status !== expectStatus) {
    fail(`${method} ${path}`, `status ${res.status} expected ${expectStatus}: ${text.slice(0, 500)}`);
  }
  return { status: res.status, json };
}

function length(value) {
  if (value < 128) return Buffer.from([value]);
  const bytes = [];
  for (let n = value; n > 0; n >>>= 8) bytes.unshift(n & 0xff);
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}
function der(tag, ...parts) {
  const body = Buffer.concat(parts);
  return Buffer.concat([Buffer.from([tag]), length(body.length), body]);
}
function seq(...parts) {
  return der(0x30, ...parts);
}
function oid(value) {
  const values = value.split(".").map(Number);
  const bytes = [values[0] * 40 + values[1]];
  for (const component of values.slice(2)) {
    const encoded = [component & 0x7f];
    for (let n = component >>> 7; n > 0; n >>>= 7) encoded.unshift((n & 0x7f) | 0x80);
    bytes.push(...encoded);
  }
  return der(0x06, Buffer.from(bytes));
}
function integer(bytes) {
  let value = bytes;
  while (value.length > 1 && value[0] === 0) value = value.subarray(1);
  if ((value[0] & 0x80) !== 0) value = Buffer.concat([Buffer.from([0]), value]);
  return der(0x02, value);
}
function pem(label, value) {
  const body = value.toString("base64").match(/.{1,64}/g)?.join("\n") ?? "";
  return `-----BEGIN ${label}-----\n${body}\n-----END ${label}-----\n`;
}

function generateCsr(cn) {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const COMMON_NAME = oid("2.5.4.3");
  const ECDSA_SHA256 = oid("1.2.840.10045.4.3.2");
  const subject = seq(der(0x31, seq(COMMON_NAME, der(0x0c, Buffer.from(cn)))));
  const spki = publicKey.export({ type: "spki", format: "der" });
  const info = seq(integer(Buffer.from([0])), subject, spki, der(0xa0));
  const signature = sign("sha256", info, privateKey);
  const csrDer = seq(info, seq(ECDSA_SHA256), der(0x03, Buffer.from([0]), signature));
  return pem("CERTIFICATE REQUEST", csrDer);
}

async function main() {
  console.log(`Smoke against ${BASE}`);

  const health = await api("GET", "/healthz", { expectStatus: 200 });
  ok("healthz", JSON.stringify(health.json?.data ?? health.json));

  const orgRes = await api("POST", "/api/v1/organizations", {
    body: { name: `Smoke CP ${Date.now()}` },
    expectStatus: 201,
  });
  const organizationId = orgRes.json.data.organization.id;
  ok("create-org", organizationId);

  // Mint access token the same way tests do — import from built path via dynamic import.
  const { signAccessToken } = await import("../src/modules/auth/utils/jwt.ts");
  const { ALL_PERMISSIONS } = await import("../src/shared/constants/permissions.ts");
  const userId = randomUUID();
  const jwt = signAccessToken({
    actorUserId: userId,
    organizationId,
    roles: ["ORG_ADMIN"],
    permissions: [...ALL_PERMISSIONS],
    jti: randomUUID(),
  });
  ok("mint-jwt");

  const intake = await api("POST", "/api/v1/onboarding", {
    token: jwt,
    body: {
      deploymentTier: "ENTERPRISE",
      networkScope: { vpcCidrs: ["10.1.0.0/16"], k8sNamespaces: ["prod"] },
      tprmVendors: [{ name: "Acme CRM", systemType: "salesforce" }],
      declaredPurposes: ["Support"],
      declaredSystems: ["postgres", "salesforce"],
      zoneName: "smoke-zone",
    },
    expectStatus: 201,
  });
  const enrollmentToken = intake.json.data.enrollmentToken;
  ok("onboarding-intake", enrollmentToken.slice(0, 24) + "…");

  const enroll = await api("POST", "/api/v1/agents/enroll", {
    body: {
      enrollmentToken,
      csrPem: generateCsr(`smoke-${Date.now()}`),
      agentName: "smoke-agent",
      agentVersion: "smoke-1",
      zoneName: "smoke-zone",
      capabilities: ["discovery"],
    },
    expectStatus: 201,
  });
  const agentId = enroll.json.data.agentId;
  ok("agent-enroll", agentId);

  const { prisma } = await import("../src/infrastructure/database/prisma-client.ts");
  const cert = await prisma.agentCertificate.findFirst({ where: { agentId } });
  if (!cert) fail("load-cert", "missing certificate row");
  ok("cert-serial", cert.serialNumber);

  const hb = await api("POST", "/api/v1/agents/heartbeat", {
    token: `agent_dev_${agentId}`,
    body: { targetHealth: "HEALTHY", version: "smoke-1" },
    expectStatus: 200,
  });
  if (!hb.json.data?.ack) fail("heartbeat", hb.json);
  ok("heartbeat");

  const systems = [
    {
      externalId: "smoke-pg",
      name: "Smoke Postgres",
      systemType: "DATABASE",
      assets: [
        {
          externalId: "users",
          name: "users",
          assetType: "TABLE",
          fields: [
            {
              externalId: "email",
              name: "email",
              pii: true,
              confidence: 0.97,
              isIdentifier: true,
              identityHashes: [createHash("sha256").update("smoke@example.com").digest("hex")],
            },
          ],
        },
      ],
    },
  ];
  const discoveryBody = {
    schemaVersion: "1.0",
    reportId: randomUUID(),
    agentId,
    revision: 1,
    discoveredAt: new Date().toISOString(),
    reportHash: "0".repeat(64),
    systems,
  };
  discoveryBody.reportHash = createHash("sha256")
    .update(JSON.stringify({ ...discoveryBody, reportHash: undefined }))
    .digest("hex");

  await api("POST", "/api/v1/agents/discovery", {
    token: `agent_dev_${agentId}`,
    body: discoveryBody,
    expectStatus: 202,
  });
  ok("discovery");

  const system = await prisma.dataSystem.findFirst({
    where: { organizationId, externalId: "smoke-pg" },
  });
  if (!system) fail("catalog", "dataSystem not found");
  ok("catalog-system", system.id);

  const findings = await prisma.complianceFinding.count({ where: { organizationId } });
  ok("compliance-findings", `count=${findings}`);

  const agents = await api("GET", "/api/v1/agents", { token: jwt, expectStatus: 200 });
  if (!(agents.json.data ?? []).some((a) => a.id === agentId)) fail("agent-list", agents.json);
  ok("agent-list");

  const { evidenceLedgerService } = await import(
    "../src/modules/ledger/services/evidence-ledger.service.ts"
  );
  await evidenceLedgerService.appendEvent({
    organizationId,
    eventType: "SMOKE_EVENT",
    actorType: "SYSTEM",
    objectType: "Smoke",
    objectId: agentId,
    payload: { ok: true },
  });
  const verify = await api("GET", "/api/v1/ledger/verify", { token: jwt, expectStatus: 200 });
  if (!verify.json.data?.valid) fail("ledger-verify", verify.json);
  ok("ledger-verify", `entries=${verify.json.data.entryCount}`);

  await prisma.$disconnect();
  console.log("\nIndependent architecture smoke PASSED");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
