# Frontend Control Plane Screens

Backend APIs for the separate `dpdpos` frontend repo. Use JWT auth unless noted.

## 1. Onboarding intake wizard

- `POST /api/v1/onboarding/intake` — body: deployment tier, network scope, TPRM vendors, declared purposes, zone name
- Response: settings, **one-time** `enrollmentToken`, `installCommand`, `expiresAt`, `requiredPlugins`
- Permission: `onboarding:intake` (or whatever mapped in `PERMISSIONS.ONBOARDING_INTAKE`)

## 2. Agent fleet dashboard

- `GET /api/v1/agents` — list agents (state, zone, lastHeartbeatAt, cert expiry)
- `GET /api/v1/agents/:id`
- `POST /api/v1/agents/:id/revoke`
- Show badges: `ENROLLED | ONLINE | DEGRADED | OFFLINE | REVOKED`

## 3. Data catalog explorer

- Inventory APIs remain: `GET /api/v1/data-assets`
- Agent discoveries set `source=AGENT` (or `AGENT_DISCOVERED` mapping) with PII tags
- Surface ComplianceFindings linked to systems/assets (from validation runs / findings)

## 4. Violations inbox (source filter)

- `GET /api/v1/violations?findingSource=AGENT|ASSESSMENT|VALIDATION|MANUAL`
- Display `findingSource` and `dedupeKey` badges so CLI vs Agent vs Validation are distinct
- Same remediation deep-link as today

## 5. DSR partial-status / Privacy Portal

- Existing DSR + erasure checklist APIs
- New: erasure saga status + agent dispatch endpoints under `/api/v1/data-subject-requests/:id/...`
- UI must show `{ total, completed, inRetry, failed, escalated }` — never hide partial completion
- Link escalated items to related Violations (`VLD-DSR-ESCALATED`)

## 6. Consent management

- Existing notice/consent record APIs
- Show agent consent-cache health via validation rule `VLD-CONSENT-CACHE` / agent fleet heartbeats

## 7. Plugin registry (admin)

- `GET/POST /api/v1/plugins` — upload/list signed WASM metadata
- Agents pull `GET /api/v1/agents/plugins/manifest` (mTLS)

## 8. Evidence ledger viewer

- `GET /api/v1/ledger/verify` → `{ valid, entryCount, lastHash }`
- `GET /api/v1/ledger/export` → compliance receipt bundle
- Permissions: `ledger:read`, `ledger:verify`

## 9. Compliance readiness dashboard

- Validation runs + analytics endpoints
- Include new agent-aware rule scores (`VLD-*` codes)
- Count open findings by rule code and open violations by `findingSource`
