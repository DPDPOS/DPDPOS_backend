/**
 * DPDPOS backend — Proof-of-Concept demo
 *
 * Walks the live API through the product story:
 *   auth → framework → inventory → consent → rights →
 *   validation → violation → remediation → analytics
 *
 * Prerequisites: API (+ worker) running, DB seeded.
 *   npm run demo:poc
 * or via bootstrap:
 *   ./scripts/run-poc-demo.sh
 */

const BASE_URL = process.env.DEMO_BASE_URL ?? "http://127.0.0.1:3000";
const ORG_ID =
  process.env.DEMO_ORG_ID ?? "00000000-0000-4000-8000-000000000001";
const EMAIL = process.env.DEMO_EMAIL ?? "admin@demo.dpdpos.local";
const PASSWORD = process.env.DEMO_PASSWORD ?? "ChangeMe123!";

type Json = Record<string, unknown>;

const stamp = Date.now();
let stepNo = 0;
let accessToken = "";
let userId = "";

function hr(char = "─", width = 64): string {
  return char.repeat(width);
}

function banner(title: string): void {
  console.log(`\n${hr("═")}`);
  console.log(`  ${title}`);
  console.log(hr("═"));
}

function narrate(message: string): void {
  console.log(`\n  ▸ ${message}`);
}

function ok(label: string, detail?: unknown): void {
  console.log(`  ✓ ${label}`);
  if (detail !== undefined) {
    const text =
      typeof detail === "string" ? detail : JSON.stringify(detail, null, 2);
    for (const line of text.split("\n")) {
      console.log(`      ${line}`);
    }
  }
}

function fail(message: string, body?: unknown): never {
  console.error(`\n  ✗ ${message}`);
  if (body !== undefined) {
    console.error(JSON.stringify(body, null, 2));
  }
  process.exit(1);
}

async function request(
  method: string,
  path: string,
  body?: unknown,
  opts?: { auth?: boolean },
): Promise<{ status: number; data: Json; payload: Json }> {
  const url = `${BASE_URL}${path}`;
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (opts?.auth !== false && accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const res = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  let payload: Json = {};
  const raw = await res.text();
  if (raw) {
    try {
      payload = JSON.parse(raw) as Json;
    } catch {
      payload = { raw };
    }
  }

  const envelope = payload as { success?: boolean; data?: Json };
  return {
    status: res.status,
    data: (envelope.data ?? payload) as Json,
    payload,
  };
}

async function api(
  method: string,
  path: string,
  body?: unknown,
  opts?: { auth?: boolean; expectStatus?: number | number[]; quiet?: boolean },
): Promise<{ status: number; data: Json }> {
  if (!opts?.quiet) {
    stepNo += 1;
    console.log(`\n  [${stepNo}] ${method} ${path}`);
  }

  const { status, data, payload } = await request(method, path, body, opts);

  const expected = opts?.expectStatus ?? [200, 201];
  const allowed = Array.isArray(expected) ? expected : [expected];
  if (!allowed.includes(status)) {
    fail(`Expected HTTP ${allowed.join("|")}, got ${status}`, payload);
  }

  const envelope = payload as { success?: boolean };
  if (envelope.success === false) {
    fail(`API returned success=false`, payload);
  }

  return { status, data };
}

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

async function waitForReady(timeoutMs = 90_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${BASE_URL}/readyz`);
      if (res.ok) {
        ok("API ready (Postgres + Redis)");
        return;
      }
    } catch {
      // keep polling
    }
    await sleep(1500);
  }
  fail(`API not ready at ${BASE_URL} within ${timeoutMs}ms`);
}

async function pollValidationRun(
  runId: string,
  timeoutMs = 60_000,
): Promise<Json> {
  const start = Date.now();
  let lastStatus = "";
  while (Date.now() - start < timeoutMs) {
    const { status, data } = await request(
      "GET",
      `/api/v1/validation-runs/${runId}`,
    );
    if (status !== 200) {
      await sleep(2000);
      continue;
    }
    const runStatus = String(data.status ?? "");
    if (runStatus === "COMPLETED" || runStatus === "FAILED") {
      ok(`Validation run ${runStatus}`);
      return data;
    }
    if (runStatus !== lastStatus) {
      narrate(`Validation run still ${runStatus || "PENDING"} — waiting for worker…`);
      lastStatus = runStatus;
    }
    await sleep(2000);
  }
  fail(
    "Validation run did not finish. Is the worker running? (npm run dev:worker)",
  );
}

async function pollUntil(
  label: string,
  fn: () => Promise<boolean>,
  timeoutMs = 45_000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await fn()) {
      ok(label);
      return;
    }
    await sleep(2000);
  }
  narrate(`${label} — timed out (continuing; worker may still catch up)`);
}

function asList(data: unknown): Array<Json> {
  if (Array.isArray(data)) return data as Array<Json>;
  if (data && typeof data === "object" && Array.isArray((data as Json).items)) {
    return (data as { items: Array<Json> }).items;
  }
  return [];
}

async function main(): Promise<void> {
  banner("DPDPOS Backend — Proof of Concept Demo");
  console.log(`  Base URL : ${BASE_URL}`);
  console.log(`  Org      : ${ORG_ID}`);
  console.log(`  Admin    : ${EMAIL}`);
  console.log(
    `\n  Story: Framework → Inventory → Consent → Rights →\n         Validate → Violate → Remediate → Score`,
  );

  // ── 0. Health ──────────────────────────────────────────────
  banner("0. System health");
  await waitForReady();
  const health = await api("GET", "/healthz", undefined, { auth: false });
  ok("Liveness", health.data);

  // ── 1. Auth ────────────────────────────────────────────────
  banner("1. Authenticate as Data Fiduciary admin");
  narrate("Login proves multi-tenant JWT auth + RBAC for ORG_ADMIN.");
  const login = await api(
    "POST",
    "/api/v1/auth/login",
    { organizationId: ORG_ID, email: EMAIL, password: PASSWORD },
    { auth: false },
  );

  const loginData = login.data as {
    tokens?: { accessToken?: string };
    user?: { id?: string; roles?: string[]; permissions?: string[] };
    mfaRequired?: boolean;
  };
  if (loginData.mfaRequired) {
    fail("MFA required for demo admin — disable MFA on seed user or verify MFA first");
  }
  accessToken = String(loginData.tokens?.accessToken ?? "");
  userId = String(loginData.user?.id ?? "");
  if (!accessToken) fail("No access token in login response", login.data);

  ok("Logged in", {
    userId,
    roles: loginData.user?.roles,
    permissionCount: loginData.user?.permissions?.length ?? 0,
  });

  const me = await api("GET", "/api/v1/auth/me");
  ok("Session identity", {
    email: (me.data as { email?: string }).email,
    roles: (me.data as { roles?: string[] }).roles,
  });

  // ── 2. Framework ───────────────────────────────────────────
  banner("2. Generate & publish DPDP compliance framework");
  narrate("Converts org profile into obligations (requirements) + controls.");
  const framework = await api("POST", "/api/v1/framework/generate", {
    industryProfile: "fintech",
    maturityLevel: "intermediate",
    dataSensitivity: "high",
    departmentCount: 2,
    processorCount: 1,
    isSdf: false,
  });

  const fw = framework.data as {
    id?: string;
    controls?: unknown[];
    requirements?: unknown[];
  };
  const frameworkId = String(fw.id ?? "");
  ok("Framework generated", {
    frameworkId,
    controls: fw.controls?.length ?? 0,
    requirements: fw.requirements?.length ?? 0,
  });

  await api("POST", "/api/v1/framework/publish", { frameworkId });
  ok("Framework published (roadmap live)");

  const roadmap = await api("GET", "/api/v1/framework/roadmap");
  ok("Roadmap readable", {
    id: (roadmap.data as { id?: string }).id,
    status: (roadmap.data as { status?: string }).status,
  });

  // ── 3. Inventory ───────────────────────────────────────────
  banner("3. Data inventory — what personal data is processed?");
  narrate("Registers a personal data asset and a processing activity.");
  const asset = await api("POST", "/api/v1/data-assets", {
    assetName: `Customer KYC Vault (${stamp})`,
    assetType: "Database",
    category: "Personal",
    sensitivity: "HIGH",
    description: "Identity documents and contact details for onboarding.",
    storageLocation: "ap-south-1",
    retentionPeriod: "7 years",
    ownerUserId: userId,
  });
  const dataAssetId = String((asset.data as { id?: string }).id ?? "");
  ok("Data asset created", {
    id: dataAssetId,
    name: (asset.data as { assetName?: string }).assetName,
  });

  const activity = await api("POST", "/api/v1/processing-activities", {
    dataAssetId,
    purpose: "Customer onboarding and KYC verification",
    sourceSystem: "Onboarding Portal",
    recipientType: "Internal",
    legalBasis: "Consent",
    retentionRule: "Delete 7 years after account closure",
  });
  ok("Processing activity mapped", {
    id: (activity.data as { id?: string }).id,
    purpose: (activity.data as { purpose?: string }).purpose,
  });

  // ── 4. Consent ─────────────────────────────────────────────
  banner("4. Notice + consent — proof of lawful processing");
  narrate("Publish a notice, grant consent, then demonstrate withdrawal.");
  const notice = await api("POST", "/api/v1/notices", {
    title: `KYC Privacy Notice (${stamp})`,
    content:
      "We process your identity documents for KYC under the DPDP Act with your consent.",
    effectiveFrom: new Date().toISOString(),
  });
  const noticeId = String((notice.data as { id?: string }).id ?? "");
  ok("Notice published", {
    id: noticeId,
    version: (notice.data as { version?: number }).version,
  });

  const consent = await api("POST", "/api/v1/consent-records", {
    dataSubjectIdentifier: `principal.${stamp}@example.com`,
    noticeId,
    dataAssetId,
    purpose: "KYC verification",
    proofFileId: `evidence/demo-consent-${stamp}`,
  });
  const consentId = String((consent.data as { id?: string }).id ?? "");
  ok("Consent granted", {
    id: consentId,
    state: (consent.data as { consentState?: string }).consentState,
  });

  const withdrawn = await api("POST", `/api/v1/consent-records/${consentId}/withdraw`);
  ok("Consent withdrawn (lifecycle proven)", {
    state: (withdrawn.data as { consentState?: string }).consentState,
    withdrawnAt: (withdrawn.data as { withdrawnAt?: string }).withdrawnAt,
  });

  // Re-grant so later rules have a cleaner story (optional second principal)
  const consent2 = await api("POST", "/api/v1/consent-records", {
    dataSubjectIdentifier: `principal.active.${stamp}@example.com`,
    noticeId,
    dataAssetId,
    purpose: "KYC verification",
    proofFileId: `evidence/demo-consent-active-${stamp}`,
  });
  ok("Second consent still GRANTED for ongoing processing", {
    id: (consent2.data as { id?: string }).id,
    state: (consent2.data as { consentState?: string }).consentState,
  });

  // ── 5. Rights ──────────────────────────────────────────────
  banner("5. Data Principal rights request (erasure)");
  narrate("Shows SLA-tracked request handling instead of email threads.");
  const dsr = await api("POST", "/api/v1/data-subject-requests", {
    requestType: "ERASURE",
    requesterReference: `principal.${stamp}@example.com`,
  });
  const dsrId = String((dsr.data as { id?: string }).id ?? "");
  let dsrVersion = Number((dsr.data as { version?: number }).version ?? 1);
  ok("Erasure request submitted", {
    id: dsrId,
    status: (dsr.data as { status?: string }).status,
    dueAt: (dsr.data as { dueAt?: string }).dueAt,
  });

  const assigned = await api("PATCH", `/api/v1/data-subject-requests/${dsrId}`, {
    version: dsrVersion,
    status: "ASSIGNED",
    assignedTo: userId,
  });
  dsrVersion = Number((assigned.data as { version?: number }).version ?? dsrVersion + 1);

  const inProgress = await api("PATCH", `/api/v1/data-subject-requests/${dsrId}`, {
    version: dsrVersion,
    status: "IN_PROGRESS",
  });
  dsrVersion = Number(
    (inProgress.data as { version?: number }).version ?? dsrVersion + 1,
  );

  const responded = await api("PATCH", `/api/v1/data-subject-requests/${dsrId}`, {
    version: dsrVersion,
    status: "RESPONDED",
    resolutionNotes: "Erasure completed across KYC vault and backups scheduled.",
  });
  ok("Request closed with response", {
    status: (responded.data as { status?: string }).status,
    version: (responded.data as { version?: number }).version,
  });

  // ── 6. Validation ──────────────────────────────────────────
  banner("6. Continuous validation — rule engine");
  narrate("Worker executes DPDP rules (notice, consent, SLA, retention…).");
  const triggered = await api("POST", "/api/v1/validation-runs", {});
  const runId = String((triggered.data as { id?: string }).id ?? "");
  ok("Validation run enqueued", {
    runId,
    status: (triggered.data as { status?: string }).status,
  });

  const completed = await pollValidationRun(runId);
  const results = (completed.results as Array<{
    ruleCode?: string;
    resultStatus?: string;
  }>) ?? [];
  const passCount = results.filter((r) => r.resultStatus === "PASS").length;
  const failCount = results.filter((r) => r.resultStatus === "FAIL").length;
  ok("Validation completed", {
    status: completed.status,
    durationMs: completed.durationMs,
    pass: passCount,
    fail: failCount,
    results: results.map((r) => `${r.ruleCode}: ${r.resultStatus}`),
  });

  // ── 7. Violations + remediation ────────────────────────────
  banner("7. Enforcement — violations & remediation");
  narrate(
    "Failed rules raise violations; remediation tasks drive closure.",
  );

  let violationId = "";
  await pollUntil(
    "Auto-created violations visible (event bus)",
    async () => {
      const { status, data } = await request("GET", "/api/v1/violations");
      if (status !== 200) return false;
      const rows = asList(data);
      if (rows.length === 0) return false;
      violationId = String(rows[0]?.id ?? "");
      return Boolean(violationId);
    },
    20_000,
  );

  if (!violationId) {
    narrate("No auto-violation yet — creating one manually to prove the board.");
    const manual = await api("POST", "/api/v1/violations", {
      severity: "HIGH",
      title: `Demo: missing retention evidence (${stamp})`,
      description:
        "PoC violation opened to demonstrate remediation workflow.",
    });
    violationId = String((manual.data as { id?: string }).id ?? "");
    ok("Manual violation opened", { id: violationId });
  } else {
    ok("Violation on board", { id: violationId });
  }

  const task = await api("POST", "/api/v1/remediation-tasks", {
    violationId,
    taskTitle: "Publish retention schedule evidence",
    taskDescription:
      "Attach retention policy proof and re-run validation for retention-metadata-set.",
    assignedTo: userId,
    dueAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  });
  ok("Remediation task assigned", {
    id: (task.data as { id?: string }).id,
    status: (task.data as { status?: string }).status,
    title: (task.data as { taskTitle?: string }).taskTitle,
  });

  const tasks = await api("GET", "/api/v1/remediation-tasks");
  ok("Remediation queue", { count: asList(tasks.data).length });

  // ── 8. Analytics snapshot ──────────────────────────────────
  banner("8. Executive snapshot (analytics)");
  narrate("Dashboards prove the operating system view for leadership.");
  try {
    const dash = await request("GET", "/api/v1/analytics/dashboard");
    if (dash.status === 200) {
      ok("Dashboard overview", dash.data);
    } else {
      narrate(`Analytics dashboard returned ${dash.status} — core PoC still complete.`);
    }
  } catch {
    narrate("Analytics optional in this build — skipping.");
  }

  try {
    const score = await request("GET", "/api/v1/analytics/compliance-score");
    if (score.status === 200) {
      ok("Compliance score", score.data);
    }
  } catch {
    // optional
  }

  // ── Summary ────────────────────────────────────────────────
  banner("PoC complete — what this proved");
  console.log(`
  ✔ Multi-tenant auth with role permissions
  ✔ DPDP framework generation + publish
  ✔ Personal data inventory + processing map
  ✔ Notice / consent grant & withdrawal trail
  ✔ Data Principal rights request lifecycle + SLA
  ✔ Automated validation rule execution (worker)
  ✔ Violation board + remediation assignment
  ✔ API surface ready for frontend / auditor demos

  Demo credentials:
    org   : ${ORG_ID}
    email : ${EMAIL}
    pass  : ${PASSWORD}

  Key IDs from this run:
    framework : ${frameworkId}
    dataAsset : ${dataAssetId}
    notice    : ${noticeId}
    dsr       : ${dsrId}
    validation: ${runId}
    violation : ${violationId}
`);
  console.log(hr("═"));
  console.log("  DPDPOS backend PoC demo finished successfully.\n");
}

main().catch((err) => {
  console.error("\nDemo crashed:", err);
  process.exit(1);
});
