# Control Plane Handoff — CLI / Zone Agent Team

**Audience:** Engineer building the Zone Agent runtime and/or extending `dpdp-cli`  
**Control Plane repo:** `dpdpos_backend` (this document lives there)  
**Date:** 2026-09-02  
**Status:** Control Plane APIs + contracts are implemented and smoke-tested on the backend

---

## 1. What we did (Control Plane / backend)

We evolved DPDPOS from a compliance console + assessment CLI into a **Universal Control Plane** that your agent dials out to. Existing JWT console APIs and assessment `CliToken` (`dpdp_*`) flows are **unchanged**.

### Delivered on backend

| Area | What exists now |
|---|---|
| **Agent API contract** | [`docs/16_agent_control_plane_contract.md`](16_agent_control_plane_contract.md) + JSON Schemas in [`docs/contracts/agent/`](contracts/agent/) |
| **Enrollment + PKI** | `POST /api/v1/agents/enroll` (one-time token + CSR → client cert + CA cert) |
| **Heartbeat + tasks** | `POST /api/v1/agents/heartbeat` — health update; piggybacks ≤1 pending `AgentTask` |
| **Discovery ingestion** | `POST /api/v1/agents/discovery` — catalog systems/assets/fields, revisions, identity graph edges |
| **DSR saga** | Control Plane fans out erasure tasks; checklist + partial status APIs for the portal |
| **Consent hot-path** | Withdrawal → Redis invalidation queue; agent gets snapshot + `pendingInvalidations` on heartbeat |
| **Plugins** | Manifest API for agents; admin upload/list under `/api/v1/plugins` |
| **Evidence ledger** | Org-scoped hash chain; verify/export under `/api/v1/ledger` |
| **Enforcement spine** | Agent never opens Violations. CP upserts `ComplianceFinding` → validations → `Violation` via `openOrDedupe` (`findingSource` + `dedupeKey`) |
| **Onboarding intake** | `POST /api/v1/onboarding` (alias `/intake`) → enrollment token + install command + required plugin list |
| **Tests** | Vitest HTTP + DB suites; independent smoke: `npx tsx scripts/smoke-control-plane.mjs` |

### Auth planes (do not mix)

| Client | Auth | Prefix / mechanism |
|---|---|---|
| **Assessment / vendor CLI** (`dpdp-cli`) | Bearer token | `dpdp_*` → `CliToken` (assessment/vendor scoped) |
| **Zone Agent** (your new runtime) | Enrollment token once, then mTLS (or `agent_dev_<agentId>` when `AGENT_MTLS_ENABLED=false`) | Separate `Agent` + `AgentCertificate` tables |
| **Admin / frontend** | JWT | Unchanged |

---

## 2. What is done vs what you own

### Done for you (consume these)

1. **Stable contract** — treat [`docs/16_agent_control_plane_contract.md`](16_agent_control_plane_contract.md) + JSON Schemas as source of truth.
2. **Working enrollment path** — DPO runs onboarding intake → gets `enrollmentToken` + install command.
3. **Discovery → findings → violations** — you upload discovery reports; CP creates findings/violations.
4. **Task delivery** — CP queues `AgentTask`; you pull via heartbeat (dial-out only, port 443 outbound).
5. **Consent cache support** — snapshot + invalidation events on heartbeat response.
6. **Plugin manifest** — CP tells you which WASM plugins to load (hashes/signatures).

### You build (Zone Agent repo — separate)

Implement roughly in this order:

1. **Installer** — `curl \| sh` / binary install accepting `--url`, `--token`, `--zone`.
2. **Local keypair** — EC P-256; private key **never** leaves the zone.
3. **Enroll** — CSR + token → store client cert + CA + `agentId` + scope profile.
4. **mTLS client** — all post-enroll calls dial out to CP (dev: `Authorization: Bearer agent_dev_<agentId>` if mTLS off).
5. **Heartbeat loop** (~30s) — probe connectors; POST health; execute piggybacked task if present.
6. **Cert rotation** — around day 25 of 30-day cert: new CSR → `POST /api/v1/agents/rotate-cert` → hot-swap.
7. **WASM plugin runtime** — fetch manifest → download `.wasm` → verify signature → sandbox.
8. **Connectors** — Postgres, Mongo, REST/Salesforce, plus reuse code-scanner / vendor-scanner ideas from assessment CLI where useful.
9. **SecretResolver** — Vault / K8s Secret / env; credentials **never** sent to CP.
10. **DiskBuffer** — batch discovery events with persistence; flush as `DiscoveryReport`.
11. **Consent cache** — local TTL cache; serve `GET /consent/check` to customer backends; apply invalidations from heartbeat.
12. **DSR execution** — run erase/anonymize tasks; return signed proof in task result.

### Assessment CLI (`dpdp-cli`) — mostly unchanged

- Keep using assessment/vendor CLI tokens (`dpdp_*`).
- Do **not** route assessment scans through agent mTLS.
- Optional later: share PII regex / scanner libraries with the Zone Agent connectors — not required for v1 agent online.

---

## 3. Critical invariants (read carefully)

1. **Dial-out only** — agent initiates all connections; no inbound CP→agent firewall holes.
2. **No secrets to CP** — DB/API credentials stay in the customer zone.
3. **No raw PII in discovery** — use hashes / counts / classifications (`identityHashes`, `pii`, `confidence`).
4. **Agents never open Violations** — only upload evidence/reports/results; CP decides findings/violations.
5. **Partial DSR status is visible** — report per-task success/failure honestly; CP models `2/3 complete, 1 in retry`.
6. **Idempotency** — stable `reportId`, task result ids, enrollment `instanceKey`.

---

## 4. API cheat sheet (agent-facing)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `POST` | `/api/v1/agents/enroll` | Enrollment bearer token | Bootstrap identity + cert |
| `POST` | `/api/v1/agents/heartbeat` | mTLS / `agent_dev_*` | Health + pull task + consent invalidations |
| `POST` | `/api/v1/agents/rotate-cert` | mTLS | New client cert |
| `GET` | `/api/v1/agents/plugins/manifest` | mTLS | Required plugins + digests |
| `POST` | `/api/v1/agents/discovery` | mTLS | Submit discovery report |
| `POST` | `/api/v1/agents/tasks/:taskId/result` | mTLS | Return DSR/discovery task result + proof |
| `GET` | `/api/v1/agents/consent/snapshot` | mTLS | Warm consent cache |

Admin (JWT) for humans/frontend: `/api/v1/onboarding`, `/api/v1/agents`, `/api/v1/plugins`, `/api/v1/ledger`, DSR saga status under `/api/v1/data-subject-requests/...`.

### Local / community auth

```bash
# In .env on CP
AGENT_MTLS_ENABLED=false

# Agent calls after enroll:
Authorization: Bearer agent_dev_<agentId>
# or
X-Agent-Id: <agentId>
X-Client-Cert-Serial: <serial from enrollment>
```

### Discovery payload shape (high level)

See schema: `docs/contracts/agent/discovery-report.schema.json`

- `schemaVersion: "1.0"`
- `reportId`, `agentId`, `revision`, `discoveredAt`, `reportHash`
- `systems[]` → `assets[]` → `fields[]` with `pii`, `confidence`, `isIdentifier`, `identityHashes`

### Heartbeat response (high level)

```json
{
  "ack": true,
  "task": { "id": "...", "type": "DSR_ERASURE", "payload": {}, "attempts": 0 },
  "pendingInvalidations": [{ "userId": "...", "purpose": "marketing" }]
}
```

`task` may be omitted when queue empty.

---

## 5. Suggested integration milestones

| # | Milestone | CP ready? | Your exit criteria |
|---|---|---|---|
| M1 | Enroll + heartbeat | Yes | Agent shows `ACTIVE` in `GET /api/v1/agents` |
| M2 | Discovery upload | Yes | `DataSystem` + `ComplianceFinding` rows appear |
| M3 | Plugin load | Yes | Manifest fetch + signature verify (even stub WASM) |
| M4 | DSR task execute | Yes | Task via heartbeat → result POST → checklist advances |
| M5 | Consent cache | Yes | Snapshot + invalidation eviction; local check API |

Backend smoke reference (CP side):

```bash
npx tsx scripts/smoke-control-plane.mjs
```

---

## 6. Env / deploy notes for joint testing

- Docker: Postgres, Redis, MinIO via `docker/docker-compose.yml`
- Apply migrations: `npx prisma migrate deploy`
- Key env: `AGENT_MTLS_ENABLED`, `AGENT_CERT_TTL_DAYS`, `DEPLOYMENT_TIER`, `API_PUBLIC_URL`
- More: [`docs/18_control_plane_hardening.md`](18_control_plane_hardening.md)

Frontend screen map (separate UI repo): [`docs/17_frontend_control_plane_screens.md`](17_frontend_control_plane_screens.md)

---

## 7. Open questions / sync with Control Plane

Please confirm with backend before locking agent v1:

1. Production mTLS termination (Node `requestCert` vs reverse-proxy `X-Client-Cert-Serial`).
2. Exact signed-proof format for DSR results (fields CP will verify).
3. Whether assessment CLI scanners will be packaged as the same WASM plugins or stay separate binaries.

---

## 8. One-line summary

**Control Plane is ready for an agent that dials out, enrolls with a one-time token, heartbeats for work, uploads discovery, executes DSR tasks, and never sends secrets or opens violations.** Your job is the agent runtime (+ optional CLI packaging); our job was (and remains) the APIs, catalog, saga, ledger, and enforcement spine behind those endpoints.
