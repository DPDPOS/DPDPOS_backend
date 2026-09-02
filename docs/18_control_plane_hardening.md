# Control Plane Production Hardening Notes

## Feature flags

- Per-org: `OrganizationControlPlaneSettings.agentModeEnabled` (default false)
- Env: `AGENT_MTLS_ENABLED` — when false, agent auth accepts `X-Agent-Id` / `X-Client-Cert-Serial` (dev only)
- Env: `DEPLOYMENT_TIER=SAAS|DEDICATED|IN_VPC`

## mTLS

- Production: terminate client certs at reverse proxy (nginx/envoy) and forward `X-Client-Cert-Serial`
- Or enable Node HTTPS with `requestCert` on a dedicated agent port (e.g. 3443)
- Cert TTL: `AGENT_CERT_TTL_DAYS` (default 30); agents rotate via `POST /api/v1/agents/rotate-cert` around day 25

## Queues

- `agent-tasks-queue` — reserved for async task orchestration / DLQ processing
- Heartbeat piggyback remains the primary dial-out task delivery path

## Observability

Log fields on agent paths: `agentId`, `organizationId`, `taskId`, `correlationId`, `dedupeKey`

Suggested metrics:

- `agent_heartbeat_lag_seconds`
- `agent_task_completion_total{status}`
- `dsr_saga_partial_total`
- `violations_open{finding_source}`

## Regression gates

1. Assessment CLI evaluate still opens violations (`createFromAssessmentControlFail` → `openOrDedupe`)
2. Agent discovery upserts ComplianceFindings; validation rules FAIL → Violation
3. Same `dedupeKey` from CLI + Agent does not create two OPEN violations
4. `agentModeEnabled=false` → no agent findings for legacy tenants

## Contract tests

- `src/modules/agents/tests/agent-contract.schemas.spec.ts`
- JSON Schemas under `docs/contracts/agent/`
- Human contract: `docs/16_agent_control_plane_contract.md`

## Docker

Existing `docker/docker-compose.yml` provides Postgres, Redis, MinIO, MailHog.
For agent mTLS locally, keep `AGENT_MTLS_ENABLED=false` and use header-based agent auth.
