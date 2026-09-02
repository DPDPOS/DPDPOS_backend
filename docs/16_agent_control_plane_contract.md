# DPDPOS Agent Control Plane Contract

## 1. Purpose and invariants

This contract defines the versioned HTTPS API between the DPDPOS Control Plane (CP) and customer-hosted agents. All paths are rooted at `/api/v1`.

- Enrollment is the only agent endpoint authenticated by a one-time enrollment token. Every subsequent request uses mutual TLS (mTLS) when `AGENT_MTLS_ENABLED=true`.
- The CP derives tenant identity from the enrollment token or client certificate. An agent-supplied `organizationId` is never trusted for authorization.
- Agent IDs, task IDs, system IDs, and revision IDs are UUIDs. Timestamps are RFC 3339 UTC strings.
- Mutating requests accept `Idempotency-Key`; discovery reports and task results also contain stable identifiers.
- Unknown JSON properties are rejected unless a type explicitly declares an extension object.
- Agents inventory systems, execute narrowly scoped tasks, and return evidence. **Agents never create or open Violations.** The CP validates agent evidence, upserts `ComplianceFinding` records, and may derive a `Violation` under CP policy.
- Raw personal data must not be included in discovery or health payloads. Samples, identity values, and lookup values are hashed, tokenized, or represented only as counts.
- Plugin and rulepack artifacts are accepted only after digest and signature verification.

## 2. Authentication, authorization, and errors

### Enrollment authentication

`POST /api/v1/agents/enroll` uses `Authorization: Bearer <enrollment-token>`. Tokens are stored as hashes, expire, have bounded uses, and are tenant scoped.

### Agent authentication

All other agent endpoints use an mTLS client certificate issued by the platform CA. The CP verifies the certificate chain, validity, revocation state, certificate-to-agent binding, and agent state. During a configured non-zero rotation overlap, both the old and replacement certificates may be accepted.

When mTLS is disabled for local/community deployments, an implementation may issue a short-lived bearer credential at enrollment. That credential is an implementation detail and does not change tenant or scope checks.

### Common headers

- `X-Correlation-Id`: optional request correlation ID; the CP returns it.
- `Idempotency-Key`: required for enrollment, discovery submission, certificate rotation, and task result submission.
- `If-None-Match`: supported by plugin manifests and consent snapshots.

### Error envelope

```json
{
  "error": {
    "code": "AGENT_SCOPE_VIOLATION",
    "message": "The requested system is outside the enrolled scope.",
    "correlationId": "01J...",
    "details": {}
  }
}
```

Expected status codes are `400` invalid payload, `401` invalid credentials/certificate, `403` scope or state violation, `404` unknown resource, `409` replay/state conflict, `412` stale precondition, `422` semantically invalid report/result, `429` throttled, and `503` temporarily unavailable.

## 3. Endpoints

### 3.1 Enroll an agent

`POST /api/v1/agents/enroll`

Request:

```json
{
  "name": "prod-data-agent-01",
  "instanceKey": "host-fingerprint-or-installation-uuid",
  "agentVersion": "1.0.0",
  "platform": "linux-amd64",
  "hostname": "data-agent-01",
  "publicKeyPem": "-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----",
  "capabilities": ["discovery", "dsr.access", "dsr.erasure", "consent.snapshot"],
  "requestedScope": {
    "systemAllowlist": ["crm-prod"],
    "dataClassAllowlist": ["CONTACT", "IDENTIFIER"],
    "operations": ["DISCOVERY", "READ", "ERASE"],
    "environmentAllowlist": ["production"]
  }
}
```

The public key is generated agent-side; private keys never leave the agent.

`201 Created`:

```json
{
  "agentId": "uuid",
  "state": "ACTIVE",
  "certificatePem": "-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----",
  "caCertificatePem": "-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----",
  "certificateExpiresAt": "2026-12-01T00:00:00Z",
  "heartbeatIntervalSeconds": 60,
  "scope": {
    "systemAllowlist": ["crm-prod"],
    "dataClassAllowlist": ["CONTACT", "IDENTIFIER"],
    "operations": ["DISCOVERY", "READ", "ERASE"],
    "environmentAllowlist": ["production"]
  },
  "controlPlaneTime": "2026-09-02T15:30:00Z"
}
```

Replaying the same idempotency key with the same token and body returns the original enrollment response where safe. Reuse with a different body returns `409`.

### 3.2 Heartbeat

`POST /api/v1/agents/{agentId}/heartbeat`

Body is `AgentHealth`. The CP updates liveness and returns configuration hints:

```json
{
  "acceptedAt": "2026-09-02T15:31:00Z",
  "nextHeartbeatSeconds": 60,
  "desiredAgentVersion": "1.0.0",
  "manifestEtag": "\"sha256:...\"",
  "consentSnapshotVersion": 42,
  "pendingTaskCount": 2
}
```

Heartbeat is not a task lease and must not include discovered personal data.

### 3.3 Rotate a certificate

`POST /api/v1/agents/{agentId}/rotate-cert`

Request:

```json
{
  "publicKeyPem": "-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----",
  "currentCertificateFingerprint": "64 lowercase hex characters"
}
```

`200 OK` returns `certificatePem`, `caCertificatePem`, `certificateExpiresAt`, and `oldCertificateValidUntil`. Rotation revokes or supersedes the current certificate according to CP overlap policy. Revoked agents cannot rotate.

### 3.4 Fetch the signed plugin manifest

`GET /api/v1/agents/{agentId}/plugins/manifest`

The manifest is filtered by deployment tier, tenant policy, agent capabilities, platform, and enrolled scope.

```json
{
  "manifestVersion": 12,
  "generatedAt": "2026-09-02T15:30:00Z",
  "plugins": [
    {
      "key": "postgres-discovery",
      "version": "1.2.0",
      "artifactUrl": "https://signed-download.example/...",
      "sha256": "64 lowercase hex characters",
      "signature": "base64 signature",
      "requiredCapabilities": ["discovery"],
      "configuration": {}
    }
  ],
  "rulepacks": [],
  "signature": "base64 signature"
}
```

The response includes `ETag`; unchanged manifests return `304 Not Modified`. Artifact URLs are short lived. Agents verify both artifact digest and registry signature before activation.

### 3.5 Submit discovery

`POST /api/v1/agents/{agentId}/discovery`

Body is `DiscoveryReport`. `revision` must increase monotonically per agent and `reportHash` must be the SHA-256 digest of the canonical report content excluding `reportHash`.

`202 Accepted`:

```json
{
  "catalogRevisionId": "uuid",
  "revision": 18,
  "acceptedSystems": 3,
  "acceptedAssets": 25,
  "acceptedFields": 412,
  "findingEvaluationQueued": true
}
```

An identical `(agentId, reportHash)` is idempotent. A reused revision with different content returns `409`. The CP normalizes systems/assets/fields, creates a `CatalogRevision`, evaluates rulepacks, and upserts findings.

### 3.6 Lease the next task

`GET /api/v1/agents/{agentId}/tasks/next?waitSeconds=20`

`200 OK` returns a `DSRTask`; `204 No Content` means no eligible task. Delivery is at least once. The CP atomically leases the task to the authenticated agent and sets a lease expiry. Agents must use the task `dedupeKey` to avoid repeating irreversible operations.

### 3.7 Submit a task result

`POST /api/v1/agents/{agentId}/tasks/{taskId}/result`

Body is `DSRResult`. The path `taskId` must equal body `taskId`. The authenticated agent must own the task, and the result operation must match the dispatched task. `200 OK` acknowledges an already accepted identical result; conflicting terminal results return `409`.

```json
{
  "taskId": "uuid",
  "status": "SUCCEEDED",
  "acceptedAt": "2026-09-02T15:40:00Z",
  "ledgerEntryId": "uuid",
  "requestCompleted": false
}
```

The CP verifies result evidence, updates the task/checklist, appends an evidence-ledger entry, and decides whether the overall DSR can progress. The agent cannot close the DSR.

### 3.8 Fetch a consent snapshot

`GET /api/v1/agents/{agentId}/consent/snapshot?sinceVersion=41`

The snapshot is filtered to the agent scope and contains pseudonymous subject keys only.

```json
{
  "version": 42,
  "generatedAt": "2026-09-02T15:30:00Z",
  "fullSnapshot": false,
  "records": [
    {
      "subjectKey": "hmac-sha256:...",
      "purpose": "marketing",
      "state": "WITHDRAWN",
      "effectiveAt": "2026-09-02T15:20:00Z",
      "noticeVersion": 3
    }
  ],
  "tombstones": [],
  "nextCursor": null,
  "snapshotHash": "64 lowercase hex characters"
}
```

The response includes `ETag`. If `sinceVersion` is unavailable, the CP returns a full snapshot. `CONSENT_INVALIDATION_CHANNEL` signals that a newer version should be fetched; the channel carries identifiers/version metadata, never consent data.

## 4. Shared types

### `ScopeProfile`

```ts
type ScopeProfile = {
  systemAllowlist: string[];
  dataClassAllowlist: string[];
  operations: ("DISCOVERY" | "READ" | "CORRECT" | "ERASE" | "CONSENT_SYNC")[];
  environmentAllowlist: string[];
  rowFilters?: Record<string, string>;
};
```

The CP-issued profile is authoritative. A task may narrow it but never broaden it.

### `DiscoveryReport`

```ts
type DiscoveryReport = {
  schemaVersion: "1.0";
  reportId: string;
  agentId: string;
  revision: number;
  discoveredAt: string;
  reportHash: string;
  systems: DataSystem[];
  piiMap: PIIMap;
  findings?: ComplianceFinding[];
};
```

Agent-reported findings are observations only. The CP recomputes identity, severity, status, and deduplication before persistence.

### `DataSystem`, `DataAsset`, `DataField`, and `PIIMap`

```ts
type DataSystem = {
  externalId: string;
  name: string;
  systemType: "DATABASE" | "OBJECT_STORE" | "SAAS" | "FILE_SYSTEM" | "API" | "OTHER";
  connectorKey?: string;
  environment?: string;
  location?: string;
  metadata?: Record<string, unknown>;
  assets: DataAsset[];
};

type DataAsset = {
  externalId: string;
  name: string;
  assetType: "TABLE" | "COLLECTION" | "BUCKET" | "FILE" | "ENDPOINT" | "OTHER";
  path?: string;
  recordCountEstimate?: number;
  metadata?: Record<string, unknown>;
  fields: DataField[];
};

type DataField = {
  externalId: string;
  name: string;
  path?: string;
  dataType?: string;
  nullable?: boolean;
  pii: boolean;
  piiCategory?: string;
  confidence?: number;
  tags?: string[];
};

type PIIMap = {
  categories: Array<{
    category: string;
    occurrences: Array<{ systemExternalId: string; assetExternalId: string; fieldExternalId: string }>;
  }>;
};
```

### `DSRTask`

```ts
type DSRTask = {
  schemaVersion: "1.0";
  taskId: string;
  requestId: string;
  dedupeKey: string;
  operation: "ACCESS" | "CORRECTION" | "ERASURE";
  issuedAt: string;
  expiresAt: string;
  scope: ScopeProfile;
  subject: {
    lookupTokens: Array<{ type: string; token: string }>;
  };
  instructions: Record<string, unknown>;
};
```

Lookup tokens are purpose-bound, short lived, and must not be logged.

### `DSRResult`

```ts
type DSRResult = {
  schemaVersion: "1.0";
  resultId: string;
  taskId: string;
  dedupeKey: string;
  operation: "ACCESS" | "CORRECTION" | "ERASURE";
  status: "SUCCEEDED" | "PARTIAL" | "FAILED";
  startedAt: string;
  completedAt: string;
  systems: Array<{
    systemExternalId: string;
    status: "SUCCEEDED" | "SKIPPED" | "FAILED";
    rowsMatched?: number;
    rowsAffected?: number;
    proof?: Record<string, unknown>;
    failureReason?: string;
  }>;
  outputArtifact?: { uri: string; sha256: string; expiresAt?: string };
  resultHash: string;
};
```

Proof contains statements, counts, transaction IDs, or signed receipts—not raw returned personal data. Access exports use a short-lived encrypted artifact.

### `AgentHealth`

```ts
type AgentHealth = {
  schemaVersion: "1.0";
  agentId: string;
  observedAt: string;
  status: "HEALTHY" | "DEGRADED" | "UNHEALTHY";
  agentVersion: string;
  uptimeSeconds: number;
  pluginStatuses: Array<{ key: string; version: string; status: "READY" | "DEGRADED" | "FAILED"; message?: string }>;
  queueDepth: number;
  lastDiscoveryAt?: string;
  metrics?: Record<string, number>;
};
```

### `ComplianceFinding`

```ts
type ComplianceFinding = {
  source: "AGENT" | "ASSESSMENT" | "VALIDATION" | "MANUAL";
  sourceKey?: string;
  dedupeKey: string;
  ruleCode: string;
  title: string;
  description?: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  status?: "OPEN" | "ACKNOWLEDGED" | "RESOLVED" | "DISMISSED";
  systemExternalId?: string;
  assetExternalId?: string;
  evidence?: Record<string, unknown>;
  firstSeenAt: string;
  lastSeenAt: string;
};
```

For discovery input, agents normally use `source: "AGENT"` and omit `status`; the CP owns persisted status.

## 5. State, retry, and audit rules

- Agent state transitions: `PENDING -> ACTIVE`; `ACTIVE <-> DEGRADED`; missed heartbeat policy may set `OFFLINE`; only an administrator can recover/re-enroll a `REVOKED` agent.
- Task transitions: `PENDING -> DISPATCHED -> ACKNOWLEDGED/RUNNING -> SUCCEEDED|FAILED`; expiry/retry policy may redispatch or set `ESCALATED`. Terminal results are immutable.
- Agents retry `408`, `429`, and `5xx` with bounded exponential backoff and jitter. They do not retry semantic `4xx` failures without changing input.
- Enrollment, rotation, discovery acceptance, task dispatch/result/escalation, plugin publication, finding upsert, and ledger append emit domain events through the outbox.
- Evidence ledger entries form an organization-scoped hash chain. Verification recomputes payload and entry hashes and checks any platform signature.

The normative machine-readable payload definitions are in `docs/contracts/agent/*.schema.json`.
