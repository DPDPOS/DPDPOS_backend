# DPDPOS — Backend Architecture (Release 2)

**Document type:** Backend architecture & engineering conventions
**Scope:** Backend only — API, workers, database, events, AI, reporting, notifications, audit, security, observability. Frontend is owned independently and consumes REST only.
**Stack:** TypeScript · Node.js · Express.js · PostgreSQL + Prisma · Redis · BullMQ · JWT · S3-compatible object storage · Docker · OpenAI-compatible LLM provider
**Baseline:** Designed at Release 2 maturity from day one — background jobs, SLA monitoring, board-ready reporting, AI summarization, audit logs, exports, and security hardening are first-class from the start, not bolted on after an MVP.
**Style:** Feature-first modular monolith with clean-architecture-inspired layering and event-driven cross-module communication.
**Grounded in:** the attached PRD, architecture document, backend plan, database plan, and folder-structure document for DPDPOS.
**Explicitly out of scope:** application/business-logic code and frontend implementation.

---

## 0. Key architectural decisions and their trade-offs

| Decision | Why | Trade-off accepted |
|---|---|---|
| Feature-first modular monolith (not microservices) | One repo, one deploy unit, fast iteration for a small backend team; module boundaries are enforced in code, not by network calls | Must self-discipline module boundaries — nothing stops a bad import except review/lint rules |
| Events as the default cross-module contract | Violations, evidence, rights requests, reports, and notifications all naturally fan out to other modules (audit, notifications, AI); events avoid a tangle of direct service-to-service calls | Slightly more moving parts (event bus, handlers) than "just call the function"; eventual consistency for side effects |
| Transactional outbox for domain events | Prevents the classic bug where a DB commit succeeds but the event publish fails (or vice versa) | Extra table + relay worker to maintain |
| BullMQ-backed events for cross-cutting side effects (notifications, audit, AI, reports) | Side effects must survive process restarts and be retryable — an in-memory EventEmitter cannot guarantee that | Redis becomes a hard dependency for correctness, not just performance |
| Repository pattern with tenant-scoping baked in | Tenant leakage is the single highest-risk bug class in a multi-tenant compliance product | An extra abstraction layer over Prisma that must be kept in sync with schema changes |
| Separate deployable for HTTP API vs. workers | Compliance validation, report generation, and AI calls are slow and must never block request/response latency or scale 1:1 with API traffic | Two Docker images, two scaling policies, slightly more deployment complexity |
| AI isolated behind one module + provider interface | PRD principle: "AI must assist, not decide." Isolating AI also lets the LLM provider be swapped without touching business modules | An extra hop (queue + module boundary) even for simple summarization calls |
| Deterministic rule engine, not AI, for compliance validation | Legal/audit defensibility requires explainable, reproducible pass/fail logic | Rule authoring is more work than "ask the model" but is the only approach an auditor will trust |
| Soft delete + immutable audit log as separate concerns | Soft-deleted rows must remain visible to auditors even when hidden from normal UI; audit logs must never be edited, even by admins | Slightly more query complexity (must explicitly include soft-deleted rows in audit/history views) |

---

## 1. Architecture philosophy and goals

DPDPOS's backend is the compliance engine described in the backend plan: it owns every canonical record, enforces authorization, runs validations, orchestrates workflows, stores evidence metadata, generates reports, and preserves traceability. Five principles drive every structural decision:

1. **Domain-first.** Each business capability (framework, inventory, validations, violations, evidence, rights, reports, notifications, AI, audit, and the core platform modules) is an independently understandable module with its own routes, service, repository, and tests.
2. **Deterministic before AI.** Compliance status is always computed by the rule engine against real data. AI explains, drafts, and summarizes — it never sets a PASS/FAIL status or closes a violation.
3. **Tenant safety first.** Every query, job, event, and log line carries an `organizationId`, and the base repository refuses to run without one.
4. **Audit by default.** Any state-changing action anywhere in the system results in an immutable audit event, published the same way regardless of which module triggered it.
5. **Idempotent workflows.** Jobs, event handlers, and webhook-style operations are safe to run more than once — required because BullMQ and the event bus both provide at-least-once delivery.

The architecture must remain maintainable "after adding hundreds of APIs" and support multiple engineers working in the same repository for years. That rules out a single `controllers/`, `services/`, `models/` set of giant shared folders (the classic MVC-by-layer structure that becomes unnavigable past ~30 endpoints) in favor of **feature-first** organization, where the folder tree mirrors the business domain, not the technical layer.

---

## 2. Domain layers

Six layers exist across the codebase. They are not always separate folders inside every module (small modules collapse some of them), but the responsibilities stay conceptually distinct so business logic never leaks into the wrong place.

### 2.1 Presentation layer
Express routers, controllers, request/response DTOs, and route-level middleware (auth guard, permission guard, validation middleware). Controllers are intentionally thin: extract and validate input, call exactly one service method, map the result to an HTTP response. No `if` statement in a controller should ever encode a business rule.

### 2.2 Application layer
Services (and, for genuinely multi-step workflows, dedicated use-case classes, e.g. `SubmitRightsRequestUseCase`) that orchestrate domain logic, repositories, and cross-module calls. This is where transactions are opened, domain events are prepared, and business rules from the PRD (SLA windows, severity scoring, remediation requirements) are enforced.

### 2.3 Domain layer
Framework-agnostic business rules that don't belong to any one persistence call: state machines (violation lifecycle: Open → Triage → Assigned → In Progress → Pending Evidence → Validated → Closed → Archived; evidence lifecycle: Upload → Metadata Tagging → Control Mapping → Review → Approval → Lock → Export; rights-request lifecycle), value objects (`Severity`, `ComplianceScore`, `SlaWindow`), and invariants. Kept in a `domain/` sub-folder per module so it can be unit-tested with zero infrastructure.

### 2.4 Infrastructure layer
Everything that talks to the outside world: Prisma-backed repositories, the S3 adapter, the Redis client, the LLM provider adapter, email/Slack/Teams/webhook/SMS senders. Infrastructure implements interfaces defined by the layers above it — the application layer never imports a concrete adapter directly, only its interface, so adapters are swappable and mockable.

### 2.5 Workers layer
BullMQ processors that run outside the HTTP request/response cycle: scheduled validations, SLA sweeps, reminder notifications, evidence-expiration checks, retention cleanup, AI summarization, and large export processing. Workers depend on the same application-layer services as controllers do — they never re-implement business logic.

### 2.6 Event system and shared kernel
The event system (definitions, publishers, subscribers/handlers, the outbox relay) is the primary way unrelated modules communicate. The shared kernel (`shared/`) holds only genuinely cross-cutting, business-rule-free code: the base repository, pagination/filtering/sorting helpers, the response envelope, the base error hierarchy, correlation-id middleware, and permission-guard primitives. Nothing with organization-specific business logic lives in `shared/` — if two modules need to share business logic, that's a signal they should communicate via an event or a well-defined service interface instead.

### 2.7 Configuration
Environment loading and validation, isolated from both business logic and infrastructure so every layer receives already-validated, typed config rather than reading `process.env` directly.

---

## 3. Business modules and their responsibilities

Modules map directly to the entities and workflows in the database plan and backend plan, grouped by the same domains used in the architecture document (Governance, Discovery, Validation, Enforcement, Proof) plus the cross-cutting Operations modules.

| Domain | Module | Owns | Publishes (examples) |
|---|---|---|---|
| Core Platform | `auth` | Login, logout, refresh, password reset, MFA challenge, session/token issuance | `UserLoggedIn`, `PasswordResetRequested` |
| Core Platform | `users` | User identity, profile, status, membership | `UserInvited`, `UserDeactivated` |
| Core Platform | `roles` | Role definitions, permission sets, system vs. custom roles | `RoleAssigned`, `RolePermissionsChanged` |
| Core Platform | `organizations` | Tenant record, onboarding profile, operating units | `OrganizationCreated`, `OrganizationOnboarded` |
| Core Platform | `departments` | Internal business units and department ownership | `DepartmentCreated` |
| Governance | `framework` | Control templates, obligation templates, roadmap generation, maturity scoring, ownership assignment | `FrameworkPublished`, `ControlAssigned` |
| Governance | `controls` | Control library, control-to-obligation mapping | `ControlUpdated` |
| Governance | `requirements` | Obligation register, legal-basis references | `RequirementMapped` |
| Discovery | `inventory` | Data assets, processing activities, retention metadata, processor linkage | `DataAssetCreated`, `RetentionExpiringSoon` |
| Discovery | `consent` | Notices, consent records, versioning, withdrawal tracking | `ConsentRecorded`, `ConsentWithdrawn` |
| Discovery | `rights` | Data Principal / grievance request intake, assignment, SLA, closure | `RightsRequestSubmitted`, `RightsRequestClosed` |
| Validation | `validations` | Rule definitions, rule execution, validation runs/results, severity scoring, trend data | `ValidationCompleted`, `ValidationFailed` |
| Enforcement | `violations` | Incident lifecycle, triage, assignment, escalation, closure | `ViolationCreated`, `ViolationClosed` |
| Enforcement | `remediation` | Remediation tasks tied to violations, ownership, due dates | `RemediationTaskAssigned`, `RemediationCompleted` |
| Proof | `evidence` | Upload metadata, hashing, tagging, control mapping, review/approval, lock, export | `EvidenceUploaded`, `EvidenceApproved` |
| Proof | `reports` | Report generation orchestration, board packs, export status | `ReportRequested`, `ReportGenerated` |
| Proof | `analytics` | Dashboard metrics, aggregation, materialized snapshots | `SnapshotComputed` |
| Operations | `notifications` | Templates, preferences, multi-channel dispatch | `NotificationSent`, `NotificationFailed` |
| Operations | `ai` | Prompt/context building, summarization, drafting, insight generation | `AiSummaryReady`, `AiDraftReady` |
| Operations | `audit` | Immutable action log, actor tracking, before/after records, search/export | *(subscriber-only — does not publish)* |

Each module is structurally identical regardless of size: `routes/`, `controllers/`, `services/`, `repositories/`, `dto/`, `validators/`, `interfaces/`, `types/`, `domain/`, `events/`, `permissions/`, `constants/`, `utils/`, `tests/`, plus an `index.ts` that exports only what other modules are allowed to import (typically a narrow service interface, DTOs, and event types — never the repository).

---

## 4. Top-level folder explanations

| Folder | Purpose |
|---|---|
| `src/modules/` | One folder per business capability from the table above. This is where nearly all business logic lives. |
| `src/events/` | Cross-module event bus: event type definitions, the outbox relay, and the publisher/subscriber registration wiring. Individual event *handlers* live inside the consuming module (`modules/notifications/events/handlers/...`), not here — this folder only holds the shared plumbing. |
| `src/jobs/` | BullMQ queue definitions, schedulers/repeatable-job registration, retry-policy configuration, and dead-letter handling that is shared across modules. Module-specific processors live inside the owning module (`modules/validations/jobs/...`) and are registered here. |
| `src/infrastructure/` | Adapters for everything external: `database/` (Prisma client + transaction manager), `cache/` (Redis client), `storage/` (S3 adapter), `queue/` (BullMQ connection factory), `ai-provider/` (LLM adapter), `email/`, `slack/`, `teams/`, `webhook/`, `sms/` senders, `logging/`, `security/` (helmet, rate limiter, sanitizer). Modules depend on the *interfaces* declared in their own `interfaces/` folder; this folder provides the concrete implementation, wired in at bootstrap. |
| `src/shared/` | The shared kernel: base repository, base error classes, response envelope, pagination/filtering/sorting helpers, permission-guard primitives, correlation-id middleware. Deliberately small and free of business logic. |
| `src/config/` | Typed, validated environment and application configuration, loaded once at boot. |
| `src/bootstrap/` | Composition root: wires infrastructure adapters to module interfaces, registers routes, registers event subscribers, registers queues — the one place allowed to know about every module at once. |
| `src/app.ts` / `src/server.ts` | Express app assembly and HTTP server entrypoint (API process). |
| `src/worker.ts` | Worker process entrypoint (separate deployable, no Express/HTTP). |
| `prisma/` | `schema.prisma`, versioned `migrations/`, and `seed/` scripts, following the database plan's entity list and retention/indexing plan. |
| `tests/integration` | Cross-module and workflow-level tests against a real Postgres/Redis (via Testcontainers or Docker Compose). |
| `tests/e2e` | Full-stack tests against a running API + worker, covering the critical paths called out in the backend plan (request lifecycle, violation lifecycle, closure lifecycle, notification lifecycle). |
| `tests/fixtures` | Shared seed/fixture data for integration and e2e tests. |
| `scripts/` | One-off operational scripts: seeding, manual migration helpers, maintenance tasks. |
| `docker/` | Dockerfiles for the `api` and `worker` images, plus local `docker-compose.yml` for Postgres/Redis/S3-compatible storage. |
| `.github/workflows/` | CI/CD pipelines: lint, test, build, migration check, deploy. |
| `docs/` | Architecture and API documentation, including the generated OpenAPI spec. |

---

## 5. Dependency flow

```
Controller  →  Service  →  Repository  →  Prisma  →  PostgreSQL
     │             │
     │             ├──→ Domain (state machines, value objects)
     │             ├──→ Other module's public Service interface (rare, read-only, no cycles)
     │             └──→ Event publisher → Outbox → Event bus → other modules' handlers
     │
     └──→ DTO validation (pre-controller middleware)
```

Rules enforced by lint boundaries (e.g. an ESLint import-boundary rule) and code review, not just convention:

- A module may import another module's `index.ts` (its public interface) but **never** reach into `modules/other/repositories/*` or `modules/other/services/*` directly.
- A module's repository may only be imported inside that same module.
- Cross-module *side effects* (notify someone, write an audit row, trigger an AI summary, invalidate a report snapshot) go through events, not direct calls — this is what keeps `violations` from ever needing to import `notifications`, `audit`, or `ai`.
- Cross-module *reads that must be synchronous* (e.g. rights-request creation needs to validate the requester against `organizations`) go through the target module's exported service method, treated as a stable internal API with its own DTO.
- Infrastructure adapters are injected via the composition root (`src/bootstrap/`), not imported directly inside services — services depend only on the interface, which keeps the layer testable and the LLM/storage/email providers swappable.

---

## 6. HTTP request lifecycle

1. **Ingress middleware** — correlation-id generation, structured request logging, Helmet security headers, body parsing, rate limiting.
2. **Authentication** — JWT access token verified; `req.user` and `req.organizationId` attached from the token claims (never trusted from the request body).
3. **Authorization** — `PermissionGuard` middleware checks the route's declared required permission (e.g. `violation:close`) against the caller's role/permission set; MFA-gated routes additionally check a recent MFA assertion.
4. **Validation middleware** — the route's DTO schema parses and validates `body`/`query`/`params`; unknown fields are rejected; failure short-circuits with a `400 ValidationError` before the controller runs.
5. **Controller** — thin: builds a request context (actor, tenant, correlation id), calls exactly one service method, maps the result to the response envelope.
6. **Service (application layer)** — executes the use case: loads/validates domain state, applies business rules, opens a Prisma transaction for multi-step writes, calls repositories, and — on successful commit — writes an outbox event row in the *same* transaction.
7. **Repository (infrastructure layer)** — every query is automatically scoped by `organizationId` via the base repository; soft-deleted rows excluded by default; audit fields (`created_by`, `updated_by`, timestamps) populated from the request context.
8. **Response formatting middleware** — wraps the result in the standard success envelope.
9. **Global error-handling middleware** (last in the chain) — catches any thrown `AppError`, maps it to the correct HTTP status and error envelope, logs at the right severity, and never leaks stack traces in production.
10. **Post-response, async** — the outbox relay picks up the new event row shortly after commit and publishes it to the event bus; this is what ultimately triggers the audit-log write, any notification, and any AI follow-up — none of which block the original response.

---

## 7. Event-driven architecture and event lifecycle

**Why events, not direct calls:** almost every meaningful state change in DPDPOS (a violation opens, evidence uploads, a rights request is submitted, a report finishes, a framework publishes) has multiple unrelated consumers — audit logging always, notifications usually, AI summarization sometimes, analytics snapshot invalidation often. Direct service-to-service calls would force every producer module to know about every consumer module. Events invert that: producers publish facts about what happened; consumers subscribe to what they care about.

**Lifecycle of one event, end to end:**

1. A service completes a state change inside a Prisma transaction (e.g. `violations.service` creates a Violation row).
2. In the **same transaction**, it writes a row to an `outbox_events` table: `{ id, eventType: "ViolationCreated", payload, organizationId, createdAt, publishedAt: null }`. This is the **transactional outbox pattern** — it guarantees the event is recorded if and only if the business change actually committed, eliminating the dual-write problem between "save to Postgres" and "publish to Redis/BullMQ."
3. A lightweight **outbox relay worker** polls (or is notified via `LISTEN/NOTIFY`) for unpublished rows, publishes each to the event bus, and marks it `publishedAt`.
4. The **event bus** is BullMQ-backed for any event with durable, cross-process consumers (notifications, audit, AI, analytics) — this gives retries, backoff, and dead-lettering for free. A lightweight in-process `EventEmitter` is acceptable only for same-process, non-critical, fire-and-forget concerns (e.g. cache invalidation) where losing an event on crash is harmless.
5. **Handlers live in the consuming module**, e.g. `modules/audit/events/handlers/violation-created.handler.ts`, `modules/notifications/events/handlers/violation-created.handler.ts`. The producing module (`violations`) never imports or knows about these handlers — this is what keeps the dependency graph acyclic.
6. Handlers are **idempotent by construction**: every event carries a stable `eventId`, and handlers upsert or check-before-write using that id, because BullMQ and the outbox relay both guarantee *at-least-once*, not exactly-once, delivery.
7. A failed handler retries with exponential backoff per the module's job policy; after exhausting retries it moves to that queue's dead-letter queue, which is monitored and alertable.

---

## 8. Background job and queue architecture (BullMQ)

**Queues** (one per operational concern, backed by Redis):

- `validation-queue` — on-demand, scheduled, and event-triggered rule executions.
- `report-queue` — report generation and board-pack assembly.
- `notification-queue` — all outbound notification sends, regardless of channel.
- `ai-queue` — every LLM call (summarize, draft, explain, search assist).
- `audit-queue` — audit-log persistence (consumes the outbox-relayed `AuditEvent`).
- `retention-queue` — expiry scans for evidence, requests, and validation/violation history.
- `export-queue` — large CSV/PDF/Excel export jobs.
- `event-relay-queue` — internal queue used by the outbox relay itself.

**Workers** run in a dedicated process (`src/worker.ts`), never inside the API process, so validation runs or AI calls cannot starve HTTP request handling and so each queue can be scaled independently (e.g. more `ai-queue` workers during a bulk-drafting session without touching API capacity).

**Schedulers** register BullMQ *repeatable* jobs at worker boot: daily validation sweep, weekly report generation, SLA-reminder sweep, evidence-expiration check, retention cleanup — matching the "scheduled jobs" list in the backend plan.

**Retry policy:** exponential backoff, attempt limits tuned per job type (e.g. 5 attempts for notification sends, 3 for AI calls given cost, 5 for validation runs). Every job payload includes a deterministic **idempotency/dedupe key** (e.g. `violationId:ruleCode` or a content hash) so retries and re-enqueues cannot create duplicate violations, notifications, or evidence rows.

**Dead-letter handling:** jobs that exhaust retries move to a queue-specific DLQ rather than disappearing; DLQ depth is an alertable metric, and a small admin tool (Bull Board or equivalent, behind admin auth) lets an engineer inspect and manually replay failed jobs.

**Delayed jobs** are used for SLA reminders (e.g. "remind at T‑2 days before due_at") and are scheduled at the moment the SLA clock starts, not computed by a constantly-polling loop.

---

## 9. Database interaction flow

- **Schema** follows the database plan's entity list (`organizations`, `users`, `roles`, `departments`, `data_assets`, `processing_activities`, `notices`, `consent_records`, `data_subject_requests`, `validation_rules`, `validation_runs`, `validation_results`, `violations`, `remediation_tasks`, `evidence_files`, `audit_logs`, `reports`, `notifications`, plus `outbox_events` and `ai_usage_logs` added by this architecture). One `schema.prisma`, models grouped and commented by domain to stay navigable as the count grows.
- **Repository pattern:** one repository per aggregate root, exposing domain-friendly methods (`findOpenByOrg`, `createWithAudit`, `markClosed`) instead of leaking raw Prisma calls into services. A generic `BaseRepository<T>` in `shared/` implements tenant scoping, soft-delete filtering, and pagination once, so every concrete repository inherits it rather than reimplementing it.
- **Tenant scoping:** the base repository requires `organizationId` on every read/write call — there is no method signature that allows an org-less query, which removes the most common way tenant isolation bugs get introduced.
- **Transactions:** any write that touches more than one table (e.g. Violation + RemediationTask + outbox event) runs inside `prisma.$transaction(...)` (interactive transactions), so partial writes are impossible.
- **Optimistic locking:** entities that can be edited concurrently by multiple users (`violations`, `remediation_tasks`, `data_subject_requests`, `validation_rules`) carry a `version` integer; updates include `WHERE version = :expected` and increment it, raising a `ConflictError` (409) on mismatch rather than silently overwriting a concurrent edit.
- **Soft deletes:** a `deleted_at` timestamp plus a repository-level default filter; hard deletion is reserved for retention jobs operating under an explicit, logged retention policy, never for ad hoc user actions.
- **Audit fields:** `created_by`, `updated_by`, `created_at`, `updated_at` are standard on every business table, populated by the repository from the authenticated request/job context — never accepted as client input.
- **Reusable query helpers:** shared `pagination.ts` (offset for normal lists, cursor-based for high-volume tables like `audit_logs`), `sorting.ts` (allow-listed sortable fields per resource), and `filtering.ts` (allow-listed filterable fields), so every list endpoint behaves consistently.

---

## 10. AI module architecture

The `ai` module is the **only** code in the backend allowed to call `infrastructure/ai-provider/`. No business module (violations, evidence, rights, etc.) ever imports the LLM client directly — they request AI help by publishing an event (e.g. `AiSummaryRequested`) or calling `ai`'s exported service method, and receive the result back the same way (event or polled status), which is what makes "AI assists, not decides" structurally true rather than just a policy.

- **Prompt builders** — one per use case (`explain-validation-failure.prompt.ts`, `draft-notice.prompt.ts`, `summarize-evidence.prompt.ts`, `draft-remediation.prompt.ts`), each a pure function from typed input to a prompt string.
- **Context builders** — assemble the minimum necessary context for a prompt and strip or redact personal-data fields that aren't needed, before anything is sent to the provider.
- **Summarizers / insight generators** — orchestrate a prompt builder + context builder + provider call into one use case, returning a structured result (not raw model text) wherever the consumer needs structured data.
- **Provider interface:** `LLMProvider` with `complete()` / `embed()` methods; `OpenAICompatibleAdapter` is the first implementation, living in `infrastructure/ai-provider/`. New providers (a different vendor, a self-hosted model) are added by implementing the same interface — nothing above the interface changes.
- **Retry logic and a circuit breaker** live in the adapter, isolating transient provider failures from business workflows.
- **Token usage tracking:** every call is logged to an `ai_usage_logs` table (organization, module, use case, tokens in/out, latency, estimated cost) for cost governance and per-tenant reporting.
- **Prompt versioning:** prompt templates are versioned (`v1`, `v2`, ...) in a small registry, so a change in AI behavior is traceable to a specific version — important given outputs may later need to be explained in an audit context.
- **Always asynchronous:** every AI call runs through `ai-queue`; the request/response cycle never blocks on a generative call. The API returns a "processing" status immediately; the result arrives via an event → notification, or is polled from a status endpoint.
- **Guardrail:** the AI service never writes to a compliance record directly. It writes only to an AI-owned suggestion/draft field; a human applies it through the normal service call, which is what keeps final compliance decisions deterministic and human-reviewed per the PRD.

## 11. Reporting and analytics architecture

Reporting is deliberately split from both business logic and from live-query dashboards:

- `reports` module owns report *metadata*, generation orchestration, and export status — not the rendering itself.
- `analytics` module owns dashboard metrics, aggregation, and **materialized snapshots** (e.g. a nightly `compliance_score_snapshot` job) so dashboards read pre-computed rows instead of running expensive live joins across validations, violations, and evidence on every page load.
- **Renderers** (`PdfRenderer`, `CsvRenderer`, `ExcelRenderer`) live in `infrastructure/reporting/` behind a common `ReportRenderer` interface — the `reports` service picks a renderer by report type without knowing its implementation.
- Generation is **queue-driven** (`report-queue`) for anything beyond a trivially small export, so large board packs never risk an HTTP timeout.
- **Board-ready reports** are a report *type*/template that composes multiple aggregation sources (open violations, validation pass rate, evidence completeness, overdue rights requests) — templates are data-driven, so adding a new report type doesn't require new orchestration code.

## 12. Notification system architecture

- `notifications` module owns templates, per-user/per-org preferences, and dispatch orchestration — it decides *whether* and *how* to notify.
- **Channel adapters** in `infrastructure/`: `EmailAdapter`, `SlackAdapter`, `TeamsAdapter`, `WebhookAdapter`, `SmsAdapter`, `PushAdapter`, each implementing a common `NotificationChannel` interface (`send(notification): Promise<DispatchResult>`), so adding a new channel never touches orchestration logic.
- **Preference check** happens before dispatch: the service resolves the recipient's channel preference and opt-outs, and skips channels the user has disabled.
- **Templates** are versioned like AI prompts (subject/body with variable interpolation) so notification copy changes are tracked and reviewable.
- All sends go through `notification-queue`, so a slow or rate-limited provider (e.g. Slack's API) never blocks the originating request and gets automatic retry with backoff.

## 13. Audit logging architecture

- `audit` module is **write-append-only** at the API level: it exposes creation (via event subscription) and read/search/export endpoints, and deliberately exposes no update or delete method — immutability is a structural property, not just a convention.
- Every mutating service call, on successful commit, produces an audit event (through the same outbox → event bus path as any other domain event) carrying actor, action type, entity type/id, and a redacted before/after diff.
- A dedicated `AuditLogSubscriber` inside the `audit` module consumes these events and persists them; at DPDPOS's expected scale a dedicated Postgres table (`audit_logs`, indexed and eventually partitioned by organization/time) is sufficient, with an append-only object-storage export as a longer-term archive.
- **Read side:** search/filter/export endpoints are exposed only to auditor/DPO-permitted roles, are always paginated, and export as signed, timestamped CSV/PDF audit packs suitable for regulator or board use.

## 14. Security architecture

- **Authentication:** JWT access tokens (short-lived, ~15 minutes) plus rotating refresh tokens (7–30 days); a Redis-backed revocation/deny-list handles logout and compromise response.
- **RBAC:** permissions are `resource:action` strings (e.g. `violation:close`, `evidence:export`, `report:generate`) grouped into roles; the `PermissionGuard` middleware checks the route's declared requirement against the caller's resolved permission set, which is cached in Redis per session to avoid a DB hit on every request.
- **MFA:** TOTP-based, required for privileged roles (admin, DPO, auditor) by policy, with the verification step integrated into the auth flow and secrets stored encrypted.
- **Rate limiting:** Redis-backed sliding-window limiter, tiered — stricter on `auth/*` and export endpoints than on normal reads.
- **Helmet and standard security headers** on every response.
- **Input validation and sanitization** at the DTO layer for every endpoint — schema-based, rejecting unknown fields, applied before the controller runs.
- **Encryption:** TLS in transit everywhere; encryption at rest via the managed Postgres/S3 configuration; envelope encryption for especially sensitive fields (e.g. `data_subject_identifier`) using a KMS-managed key, so even a database dump doesn't expose raw identifiers.
- **Secrets management:** no secrets in the repository or committed env files; secrets are injected at deploy time from a secrets manager, with `.env.local` (gitignored) used only for local development.
- **Password policy:** Argon2/bcrypt hashing, minimum complexity rules, and lockout after repeated failed attempts.
- **File upload safety (evidence):** MIME-type checks, hashing, virus/format validation before storage, and signed, time-limited URLs for access rather than public object URLs.

## 15. Observability architecture

- **Structured logging** (JSON, via `pino` or equivalent) with correlation-id and request-id propagated through `AsyncLocalStorage`, so a log line from a worker or event handler can be traced back to the HTTP request or job that ultimately caused it.
- **Health checks:** `/healthz` (liveness — process is up) and `/readyz` (readiness — DB, Redis, and queue connections are actually healthy), used by the orchestrator to gate traffic and restarts.
- **Metrics:** Prometheus-style counters/histograms for HTTP latency, DB query time, queue depth, job success/failure rate, and AI token usage, exposed at `/metrics`.
- **Error tracking:** a Sentry-style integration at the global Express error handler and at the worker's top-level error handler, so unexpected (non-operational) errors are captured with context regardless of where they originate.
- **Queue monitoring:** a Bull Board–style dashboard behind admin auth, plus alerting on DLQ depth growth and stalled jobs.

---

## 16. API design conventions

- **Versioned** base path: `/api/v1/...`. Breaking changes ship as `/api/v2/...` behind a deprecation window, never as an in-place breaking change to `v1`.
- **Consistent response envelope:**
  - Success: `{ "success": true, "data": ..., "meta"?: { "pagination"?: {...} } }`
  - Error: `{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "...", "details"?: [...] } }`
- **Pagination:** offset-based (`?page=&pageSize=`) for normal operational lists; cursor-based (`?cursor=&limit=`) for high-volume, append-only resources like audit logs and validation history.
- **Filtering and sorting:** query-param driven with an explicit allow-list per endpoint (e.g. `?status=open&sort=-createdAt`); unknown filter/sort keys are rejected, not silently ignored, to avoid confusing "why didn't my filter work" bugs.
- **Consistent error taxonomy** across all endpoints (see §18).
- **OpenAPI/Swagger** is generated from the same DTO schemas used for runtime validation (e.g. via a zod-to-OpenAPI generator), so the spec can never drift out of sync with actual validation behavior — it's a build artifact, not a hand-maintained document.

## 17. Engineering conventions

### 17.1 Naming conventions
- Modules, folders, and files: `kebab-case` (`data-subject-requests`, `violation-created.event.ts`).
- Classes and interfaces: `PascalCase` (`ViolationService`, `EvidenceRepository`).
- Variables, functions, methods: `camelCase`.
- Constants and enum-like values: `SCREAMING_SNAKE_CASE` (`MAX_UPLOAD_SIZE_MB`).
- Database tables and columns: `snake_case`, matching the database plan (`organization_id`, `due_at`).
- Route paths: plural nouns, kebab-case (`/api/v1/data-subject-requests`).

### 17.2 File naming conventions
One responsibility per file, and the file's suffix always names its layer, e.g.:
- `violation.controller.ts`
- `violation.service.ts`
- `violation.repository.ts`
- `create-violation.dto.ts`, `update-violation.dto.ts`
- `violation.validator.ts`
- `violation.routes.ts`
- `violation.permissions.ts`
- `violation-created.event.ts`
- `violation-created.handler.ts` (inside the *consuming* module)
- `violation.repository.spec.ts` / `violation.service.spec.ts`

### 17.3 DTO conventions
- One DTO per operation, not one shared "god" DTO reused everywhere (`CreateViolationDto`, `UpdateViolationDto`, `ViolationResponseDto` are distinct types).
- DTOs are schema-first (e.g. zod schemas) — the TypeScript type is inferred from the schema, so validation and typing can never disagree.
- Input DTOs never include server-controlled fields (`id`, `organizationId`, `createdBy`, `version`) — those are always derived from request context, never accepted from the client.
- Response DTOs are explicit allow-lists of fields — internal-only columns (e.g. soft-delete markers, internal scoring internals) are never serialized by accident.

### 17.4 Validation conventions
- All external input (body, query, params, and file metadata) is validated at the presentation-layer boundary before a controller method runs.
- Validation errors return `400` with a field-level `details` array so the frontend can highlight the exact field.
- Business-rule validation (e.g. "this violation cannot close without evidence") lives in the service/domain layer and returns a distinct, explainable error — not conflated with DTO shape validation.

### 17.5 Repository conventions
- Repositories expose intention-revealing methods (`findOverdueByOrg`, `markResolved`), never a generic "run this Prisma query" escape hatch from outside the module.
- Every method requires `organizationId` as an explicit parameter (enforced by the base repository's type signature).
- Repositories contain **only** persistence logic — no business rules, no cross-module calls, no event publishing.
- Bulk/list methods always accept pagination/sorting/filtering options built from the shared helpers, never ad hoc per-repository pagination logic.

### 17.6 Service conventions
- One service per aggregate root per module; complex multi-step workflows get a dedicated use-case class that composes services rather than growing one service indefinitely.
- Services depend on repository *interfaces* and adapter *interfaces*, injected via the composition root — never on concrete Prisma/S3/LLM classes directly.
- A service method that changes state is responsible for: validating business rules, opening a transaction when more than one write is involved, calling repositories, and writing the outbox event row — all inside that same transaction.
- Services never touch `req`/`res` — they receive a plain request-context object (`{ organizationId, actorId, correlationId }`), which keeps them callable identically from HTTP controllers, workers, and tests.

### 17.7 Controller conventions
- A controller method is at most a few lines: parse the already-validated DTO, build request context, call one service method, return the mapped response.
- No business logic, no direct repository or Prisma access, no direct event publishing from a controller.
- Controllers translate domain/application errors to HTTP status codes only through the shared error-to-status mapping — they never construct ad hoc HTTP error responses themselves.

### 17.8 Worker conventions
- Every job handler is idempotent and accepts a typed payload validated the same way controller DTOs are.
- Workers call application-layer services — never duplicate business logic that already exists in a service.
- Every job handler is wrapped with structured logging (job id, queue name, correlation id) and a consistent retry/DLQ policy declared alongside the job, not scattered across ad hoc `try/catch` blocks.
- Long-running jobs report progress (BullMQ's progress API) so operational dashboards can show real status rather than "running" for an unknown duration.

### 17.9 Event conventions
- Every event is a versioned, typed payload (`ViolationCreatedV1`) with a stable `eventId`, `eventType`, `organizationId`, `occurredAt`, and a minimal payload — large objects are referenced by id, not embedded, so consumers fetch current state rather than trusting a possibly-stale snapshot.
- Producers publish only past-tense facts ("ViolationCreated"), never commands ("SendNotification") — that distinction is what keeps producers decoupled from what consumers choose to do.
- Handlers are named after the event they consume and live under the consuming module's `events/handlers/` folder; a module never has a handler for its own event.

---

## 18. Error handling strategy

A single `AppError` base class carries `statusCode`, `code`, and `isOperational`; all thrown errors are subclasses of it:

| Class | Status | Used for |
|---|---|---|
| `ValidationError` | 400 | DTO/schema validation failures |
| `UnauthorizedError` | 401 | Missing/invalid/expired auth token |
| `ForbiddenError` | 403 | Valid auth, insufficient permission |
| `NotFoundError` | 404 | Entity not found (or not in caller's tenant) |
| `ConflictError` | 409 | Optimistic-lock version mismatch, duplicate resource |
| `RateLimitError` | 429 | Rate limit exceeded |
| `InternalError` | 500 | Unexpected failure (`isOperational: false`) |

Controllers never catch errors themselves — every thrown error propagates to a single global Express error-handling middleware that maps `AppError` subclasses to the standard error envelope, logs operational errors at `warn` and non-operational ones at `error` (paging on-call if configured), and strips stack traces from client responses in production. Workers use the equivalent pattern: a `JobError` wrapper classifies failures as transient (retry) vs. permanent (move to DLQ immediately) rather than retrying everything blindly.

## 19. Logging strategy

- **Levels:** `trace`/`debug` (local/dev only), `info` (business-meaningful events — request completed, job succeeded, event published), `warn` (operational errors, retries, degraded dependencies), `error` (unexpected failures), `fatal` (process-crashing).
- **No PII or secrets in logs** — a logging serializer redacts known-sensitive fields (tokens, password hashes, data-subject identifiers) before a log line is emitted, so "just log the request body" is structurally impossible for sensitive DTOs.
- Every log line carries `correlationId`, `organizationId`, and `actorId` (or `system` for scheduled jobs), so a single request or job can be traced end-to-end across the API, the outbox relay, and any worker it triggers.

## 20. Testing strategy

- **Unit tests** live beside the code they test inside each module (`*.spec.ts`) — services, validators, and domain state machines are tested with repositories and adapters mocked via their interfaces.
- **Integration tests** (`tests/integration`) run against a real Postgres and Redis (Testcontainers or Docker Compose), exercising the module service layer directly or through `supertest` against a bootstrapped Express app, including multi-module event flows (e.g. "creating a violation eventually produces an audit log row").
- **E2E tests** (`tests/e2e`) run against the fully bootstrapped API **and** worker together, covering the critical workflows named in the backend plan: rights-request lifecycle, violation → remediation → closure, evidence upload → review → lock, and report generation end to end.
- **Security/tenant-isolation tests** are a dedicated suite that asserts, for every list/detail endpoint, that Organization A can never read or mutate Organization B's records — run on every PR, not just before release.
- **AI contract tests** use recorded fixtures for the LLM provider so CI never depends on a live model call (cost, flakiness, non-determinism).
- **CI gate order:** lint → unit → integration → migration check → build → e2e (on a schedule / pre-release, since it's the slowest tier).

## 21. Deployment considerations

- Two Docker images: `api` (HTTP server, stateless) and `worker` (BullMQ consumers); a `scheduler` role can reuse the `worker` image with a different startup command that only registers repeatable jobs.
- **Migrations** run as an explicit release step (`prisma migrate deploy`) before the new version receives traffic — never triggered implicitly on app boot in production, to avoid two replicas racing to migrate simultaneously.
- Config is environment-injected and **validated at boot**: the process refuses to start if required env vars are missing or malformed, rather than failing on the first request that needs them.
- Rolling or blue/green deploys gated by the `/readyz` health check, so traffic never reaches an instance whose DB/Redis/queue connections aren't actually ready.
- Object storage, Redis, and Postgres are treated as managed external dependencies (not run in-cluster) in any environment beyond local Docker Compose.

## 22. Scalability considerations

- The API tier is stateless and scales horizontally behind a load balancer with no code changes.
- Anything slow or bursty — validation runs, report generation, AI calls, large exports — is offloaded to queues, so API latency stays flat regardless of tenant data volume or how many validations happen to be running.
- Workers scale **per queue**, independently (e.g. scale `ai-queue` workers up during a bulk-drafting session without touching `notification-queue` capacity), typically via an autoscaler watching queue depth.
- Dashboards read from materialized `analytics` snapshots rather than live joins, keeping multi-tenant database load predictable as the number of organizations grows.
- Indexing follows the database plan (`organization_id`, `status`, `due_at`, `created_at`, `rule_code`, `request_type`, plus composite indexes for common filter pairs like `organization_id + status`); high-volume append-only tables (`audit_logs`, `validation_results`) are candidates for partitioning (by organization or time) once volume warrants it.
- A connection pooler (e.g. PgBouncer) sits in front of Postgres once the number of API + worker replicas grows large enough to threaten the database's native connection limit.
- Hot, cheap-to-cache reads (resolved permission sets, framework/control templates, short-TTL dashboard summaries) are cached in Redis to reduce repeated database load.

## 23. Future microservice extraction strategy

Because modules already communicate only through public service interfaces or through events (never through direct repository access), extraction is a **deployment change, not a rewrite**. The most likely first candidates, in order:

1. **`ai`** — different scaling profile (bursty, provider-rate-limited, cost-sensitive) than the rest of the platform; already fully async and queue-driven, so extraction mainly means pointing the existing `ai-queue` at a separately-deployed consumer.
2. **`reports` / `analytics`** — CPU/IO-heavy generation work that benefits from independent scaling and doesn't need to share a deploy cycle with core compliance workflows.
3. **`notifications`** — high fan-out, subject to third-party provider rate limits that shouldn't affect the rest of the platform's throughput.

**Extraction path** for any candidate module: confirm it only communicates via events/public interfaces (already true by construction) → give it its own bounded set of Prisma models (shared database initially is acceptable; "database per service" is a later step, not a prerequisite) → stand up the new service exposing the same event contract and internal API → repoint the relevant publishers/queue consumers at the new service → remove the module from the monolith. Because the event contract is already the primary interface, most of this work is infrastructure and deployment topology, not business-logic rewriting.

## 24. Common architectural mistakes to avoid

- **Fat controllers** — any business rule inside a controller breaks reusability across HTTP, worker, and future channels (mobile, third-party integrations) and makes the rule untestable without spinning up Express.
- **Cross-module repository imports** — the fastest way to create hidden coupling, circular dependencies, and a monolith that can never be split later.
- **Publishing events inside the transaction callback instead of via the outbox** — risks an event firing for a transaction that later rolls back, or being silently lost if the publish call fails after commit.
- **Trusting client-supplied `organizationId`/`userId`** instead of deriving tenant and actor identity from the authenticated session — the single most common source of tenant-isolation bugs in multi-tenant products.
- **Synchronous LLM calls inside the request/response cycle** — guarantees timeouts and a poor experience the moment the model is slow; always queue.
- **Exposing update/delete on audit logs** — even for admins — which undermines the evidentiary value the entire product is built to provide.
- **Premature microservice extraction** — the feature-first modular monolith is chosen precisely so Release 2 ships fast; splitting services before there's a real scaling or team-ownership reason adds operational cost with no corresponding benefit yet.
- **Silently excluding soft-deleted rows from audit/history views** — soft delete must remain visible to auditors even when hidden from normal day-to-day UI lists.
- **Skipping idempotency keys on jobs and events** — under at-least-once delivery, this reliably produces duplicate violations, duplicate notifications, or duplicate evidence rows.
- **Hardcoding rule or report logic in code** instead of keeping it data-driven per the PRD's "configurable, not hardcoded" principle — undermines the multi-tenant configurability the whole product is meant to provide.

---

## 25. Complete backend folder structure

Below is the full repository tree. Every module in §3 follows the identical internal pattern — that pattern is shown in full for `violations` and `evidence` as representative examples (one core-platform-adjacent enforcement module, one proof-domain module with a richer lifecycle); every other module folder listed under `modules/` carries the same internal shape (`routes/`, `controllers/`, `services/`, `repositories/`, `dto/`, `validators/`, `interfaces/`, `types/`, `domain/`, `events/`, `permissions/`, `constants/`, `utils/`, `tests/`, `index.ts`) unless a narrower note says otherwise.

```text
dpdpos-backend/
├─ src/
│  ├─ modules/
│  │  ├─ auth/
│  │  │  ├─ routes/
│  │  │  ├─ controllers/
│  │  │  ├─ services/
│  │  │  ├─ repositories/
│  │  │  ├─ dto/
│  │  │  ├─ validators/
│  │  │  ├─ interfaces/
│  │  │  ├─ types/
│  │  │  ├─ domain/              # token/session state, MFA challenge state machine
│  │  │  ├─ events/
│  │  │  ├─ permissions/
│  │  │  ├─ constants/
│  │  │  ├─ utils/
│  │  │  ├─ tests/
│  │  │  └─ index.ts
│  │  ├─ users/
│  │  ├─ roles/
│  │  ├─ organizations/
│  │  ├─ departments/
│  │  ├─ framework/
│  │  ├─ controls/
│  │  ├─ requirements/
│  │  ├─ inventory/
│  │  ├─ consent/
│  │  ├─ rights/
│  │  ├─ validations/
│  │  │  ├─ routes/
│  │  │  ├─ controllers/
│  │  │  ├─ services/
│  │  │  ├─ repositories/
│  │  │  ├─ dto/
│  │  │  ├─ validators/
│  │  │  ├─ interfaces/
│  │  │  ├─ types/
│  │  │  ├─ domain/              # rule engine: rule structure, pass/fail evaluation, severity scoring
│  │  │  ├─ rules/                # rule-category implementations (notice-present, consent-present, retention-expired, ...)
│  │  │  ├─ jobs/                 # scheduled/on-demand validation-run processors, registered into validation-queue
│  │  │  ├─ events/
│  │  │  ├─ permissions/
│  │  │  ├─ constants/
│  │  │  ├─ utils/
│  │  │  ├─ tests/
│  │  │  └─ index.ts
│  │  ├─ violations/
│  │  │  ├─ routes/
│  │  │  │  └─ violation.routes.ts
│  │  │  ├─ controllers/
│  │  │  │  └─ violation.controller.ts
│  │  │  ├─ services/
│  │  │  │  ├─ violation.service.ts
│  │  │  │  └─ violation-escalation.service.ts
│  │  │  ├─ repositories/
│  │  │  │  └─ violation.repository.ts
│  │  │  ├─ dto/
│  │  │  │  ├─ create-violation.dto.ts
│  │  │  │  ├─ update-violation.dto.ts
│  │  │  │  └─ violation-response.dto.ts
│  │  │  ├─ validators/
│  │  │  │  └─ violation.validator.ts
│  │  │  ├─ interfaces/
│  │  │  │  └─ violation-repository.interface.ts
│  │  │  ├─ types/
│  │  │  │  └─ violation.types.ts
│  │  │  ├─ domain/
│  │  │  │  └─ violation-lifecycle.state-machine.ts   # Open→Triage→Assigned→In Progress→Pending Evidence→Validated→Closed→Archived
│  │  │  ├─ events/
│  │  │  │  ├─ violation-created.event.ts
│  │  │  │  ├─ violation-closed.event.ts
│  │  │  │  └─ handlers/                               # handlers for events violations *subscribes to*, if any
│  │  │  ├─ permissions/
│  │  │  │  └─ violation.permissions.ts                # violation:read, violation:assign, violation:close, ...
│  │  │  ├─ constants/
│  │  │  │  └─ violation.constants.ts
│  │  │  ├─ utils/
│  │  │  ├─ tests/
│  │  │  │  ├─ violation.service.spec.ts
│  │  │  │  └─ violation-lifecycle.state-machine.spec.ts
│  │  │  └─ index.ts                                   # exports ViolationService interface + DTOs + event types only
│  │  ├─ remediation/
│  │  ├─ evidence/
│  │  │  ├─ routes/
│  │  │  ├─ controllers/
│  │  │  ├─ services/
│  │  │  │  └─ evidence.service.ts
│  │  │  ├─ repositories/
│  │  │  ├─ dto/
│  │  │  ├─ validators/
│  │  │  ├─ interfaces/
│  │  │  ├─ types/
│  │  │  ├─ domain/
│  │  │  │  └─ evidence-lifecycle.state-machine.ts     # Upload→Metadata Tagging→Control Mapping→Review→Approval→Lock→Export
│  │  │  ├─ events/
│  │  │  │  ├─ evidence-uploaded.event.ts
│  │  │  │  └─ evidence-approved.event.ts
│  │  │  ├─ permissions/
│  │  │  ├─ constants/
│  │  │  ├─ utils/
│  │  │  │  └─ file-hash.util.ts
│  │  │  ├─ tests/
│  │  │  └─ index.ts
│  │  ├─ reports/
│  │  ├─ analytics/
│  │  ├─ notifications/
│  │  │  └─ ...                                        # + channel-agnostic templates/ and preferences/
│  │  ├─ ai/
│  │  │  ├─ prompt-builders/
│  │  │  ├─ context-builders/
│  │  │  ├─ summarizers/
│  │  │  └─ ...                                        # standard module shape otherwise
│  │  └─ audit/
│  │     └─ ...                                        # read/search/export endpoints only — no update/delete
│  │
│  ├─ events/
│  │  ├─ event-bus.ts
│  │  ├─ outbox/
│  │  │  ├─ outbox.repository.ts
│  │  │  └─ outbox-relay.worker.ts
│  │  └─ types/
│  │     └─ base-event.interface.ts
│  │
│  ├─ jobs/
│  │  ├─ queues/
│  │  │  ├─ validation.queue.ts
│  │  │  ├─ report.queue.ts
│  │  │  ├─ notification.queue.ts
│  │  │  ├─ ai.queue.ts
│  │  │  ├─ audit.queue.ts
│  │  │  ├─ retention.queue.ts
│  │  │  ├─ export.queue.ts
│  │  │  └─ event-relay.queue.ts
│  │  ├─ schedulers/
│  │  │  ├─ daily-validation.scheduler.ts
│  │  │  ├─ weekly-report.scheduler.ts
│  │  │  ├─ sla-reminder.scheduler.ts
│  │  │  ├─ evidence-expiration.scheduler.ts
│  │  │  └─ retention-cleanup.scheduler.ts
│  │  ├─ policies/
│  │  │  └─ retry-policy.ts
│  │  └─ registry.ts                                    # wires each module's job processors to their queue
│  │
│  ├─ infrastructure/
│  │  ├─ database/
│  │  │  ├─ prisma-client.ts
│  │  │  └─ transaction-manager.ts
│  │  ├─ cache/
│  │  │  └─ redis-client.ts
│  │  ├─ storage/
│  │  │  └─ s3-adapter.ts
│  │  ├─ queue/
│  │  │  └─ bullmq-connection.ts
│  │  ├─ ai-provider/
│  │  │  ├─ llm-provider.interface.ts
│  │  │  └─ openai-compatible.adapter.ts
│  │  ├─ email/
│  │  ├─ slack/
│  │  ├─ teams/
│  │  ├─ webhook/
│  │  ├─ sms/
│  │  ├─ reporting/
│  │  │  ├─ pdf-renderer.ts
│  │  │  ├─ csv-renderer.ts
│  │  │  └─ excel-renderer.ts
│  │  ├─ logging/
│  │  │  └─ logger.ts
│  │  └─ security/
│  │     ├─ rate-limiter.ts
│  │     └─ sanitizer.ts
│  │
│  ├─ shared/
│  │  ├─ errors/
│  │  │  ├─ app-error.ts
│  │  │  └─ error-map.ts
│  │  ├─ middleware/
│  │  │  ├─ correlation-id.middleware.ts
│  │  │  ├─ request-logger.middleware.ts
│  │  │  ├─ error-handler.middleware.ts
│  │  │  └─ response-envelope.middleware.ts
│  │  ├─ guards/
│  │  │  ├─ auth.guard.ts
│  │  │  └─ permission.guard.ts
│  │  ├─ repository/
│  │  │  └─ base.repository.ts
│  │  ├─ pagination/
│  │  │  ├─ pagination.ts
│  │  │  ├─ sorting.ts
│  │  │  └─ filtering.ts
│  │  ├─ types/
│  │  └─ constants/
│  │
│  ├─ config/
│  │  ├─ env.ts
│  │  ├─ database.config.ts
│  │  ├─ redis.config.ts
│  │  ├─ s3.config.ts
│  │  └─ app.config.ts
│  │
│  ├─ bootstrap/
│  │  ├─ register-routes.ts
│  │  ├─ register-events.ts
│  │  ├─ register-queues.ts
│  │  └─ container.ts                                  # composition root: interfaces → concrete adapters
│  │
│  ├─ app.ts                                            # Express app assembly
│  ├─ server.ts                                         # API process entrypoint
│  └─ worker.ts                                         # worker process entrypoint
│
├─ prisma/
│  ├─ schema.prisma
│  ├─ migrations/
│  └─ seed/
│     └─ seed.ts
│
├─ tests/
│  ├─ integration/
│  ├─ e2e/
│  └─ fixtures/
│
├─ scripts/
│  ├─ seed/
│  ├─ migrate/
│  └─ maintenance/
│
├─ docker/
│  ├─ api.Dockerfile
│  ├─ worker.Dockerfile
│  └─ docker-compose.yml
│
├─ docs/
│  ├─ architecture.md
│  └─ openapi/
│
├─ .github/
│  └─ workflows/
│     ├─ ci.yml
│     └─ deploy.yml
│
├─ .env.example
├─ package.json
├─ tsconfig.json
└─ README.md
```