# DPDPOS Backend

Digital Personal Data Protection Operating System — API and background workers.

**Stack:** TypeScript · Node.js · Express · PostgreSQL + Prisma · Redis · BullMQ · JWT · S3-compatible storage · Docker

## Prerequisites

- Node.js 20+
- Docker Desktop (Postgres, Redis, MinIO) — this machine uses the standalone `docker-compose` CLI

## Quick start (local)

```bash
# 1. Install dependencies
npm install

# 2. Start infrastructure
npm run docker:up

# 3. Copy env (already present for local; use .env.example as template)
cp .env.example .env

# 4. Generate Prisma client and apply migrations
npx prisma generate
npx prisma migrate deploy

# 5. Seed demo organization, roles, and admin user
npm run prisma:seed

# 6. Run API (and optionally worker in another terminal)
npm run dev
npm run dev:worker
```

Health checks:

- `GET /healthz` — process liveness
- `GET /readyz` — Postgres + Redis readiness

API base path: `/api/v1`

Set public URLs in `.env` (required for Entra SSO and CLI mint instructions):

```env
API_PUBLIC_URL=http://localhost:3000
FRONTEND_PUBLIC_URL=http://localhost:3001
```

## Production / free-tier deployment

Deploy the **API + worker + Neon Postgres + Upstash Redis + Cloudflare R2 + Vercel frontend + npm CLI** using only free tiers.

**Full step-by-step guide:** [`docs/14_deployment.md`](./docs/14_deployment.md)

That document covers account setup, every environment variable, Render/Vercel wiring, Entra redirect URIs, seeding, smoke tests, and common failures.

Related repos:

| Repo | Role in deploy |
|---|---|
| `dpdpos_backend` (this repo) | Render Web Service + Background Worker |
| `dpdpos` | Vercel frontend (`BACKEND_URL` → this API) |
| `dpdp-cli` | Publish to npm as `dpdp-cli` (`dpdp` binary) |

## Proof-of-concept demo

One command boots infra, seeds the demo org, starts API + worker, and walks the live DPDP story (framework → inventory → consent → rights → validation → violation → remediation):

```bash
npm run demo
```

Or step by step:

```bash
npm run demo:setup          # docker + migrate + seed
npm run dev                 # terminal 1
npm run dev:worker          # terminal 2
npm run demo:poc            # narrative HTTP demo
```

Demo admin (from seed): `admin@demo.dpdpos.local` / `ChangeMe123!` on org `00000000-0000-4000-8000-000000000001`.

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | API with hot reload |
| `npm run dev:worker` | Worker with hot reload |
| `npm run build` | Compile TypeScript |
| `npm run start` / `npm run start:worker` | Production API / worker |
| `npm run test` | Run Vitest |
| `npm run docker:up` | Start Postgres, Redis, MinIO |
| `npm run prisma:migrate` | Create/apply migrations (dev) |
| `npm run prisma:deploy` | Apply migrations (CI / production) |
| `npm run prisma:seed` | Seed demo data |

## Developer ownership

See `dpdpos-progress-tracker.xlsx` and `docs/09_developer_a_implementation_plan.md`.

- **Developer A:** auth, users, roles, organizations, departments, framework, controls, requirements, outbox infra
- **Developer B:** inventory, consent, rights, validations, violations, remediation
- **Developer C:** evidence, reports, analytics, notifications, ai, audit

## Architecture

Full conventions live in `docs/architecture.md`.

Identity / Entra / AD: `docs/13_identity_ad_entra_integration_plan.md`.

## Auth guards (for all developers)

Protected routes must use `authenticate` + `requirePermission(...)`.

See **`docs/auth-guards.md`** for the copy-paste pattern, `RequestContext` fields, and error codes. Permission strings are frozen in `src/shared/constants/permissions.ts`.

### Auth session endpoints

| Method | Path | Notes |
|---|---|---|
| POST | `/api/v1/auth/login` | body: `organizationId`, `email`, `password` — may return `mfaRequired` |
| POST | `/api/v1/auth/mfa/verify` | body: `mfaToken`, `code` — completes privileged MFA login |
| POST | `/api/v1/auth/mfa/setup` | Bearer required — returns TOTP secret + otpauth URL |
| POST | `/api/v1/auth/mfa/confirm` | Bearer required — body: `code` enables MFA |
| POST | `/api/v1/auth/accept-invite` | body: `organizationId`, `email`, `inviteToken`, `password` |
| POST | `/api/v1/auth/refresh` | body: `refreshToken` (rotating) |
| POST | `/api/v1/auth/logout` | body: `refreshToken`; optional Bearer access token for deny-list |
| GET | `/api/v1/auth/me` | Bearer required |

Password login always returns an email-OTP MFA challenge. Configure the SMTP variables in `.env`; users must submit the six-digit code through `/api/v1/auth/mfa/verify` before receiving session tokens.

For local email testing, `npm run docker:up` starts MailHog. Keep `npm run dev:worker` running as well; OTP delivery is queued and sent by the worker. Open `http://localhost:8025` to view messages. For Gmail/production SMTP, set `SMTP_REQUIRE_AUTH=true` together with the provider credentials.

Demo seed: `admin@demo.dpdpos.local` / `ChangeMe123!` on org `00000000-0000-4000-8000-000000000001`.

Privileged roles (`ORG_ADMIN`, `DPO`, `AUDITOR`) should enroll MFA. Use `requireMfa` middleware on sensitive routes (exported from auth module). Role permission changes invalidate Redis permission cache keys so guards pick up new permissions immediately.

### Framework endpoints

| Method | Path | Permission |
|---|---|---|
| POST | `/api/v1/framework/generate` | `framework:generate` |
| GET | `/api/v1/framework/roadmap` | `framework:read` |
| POST | `/api/v1/framework/publish` | `framework:publish` |

### Controls endpoints

| Method | Path | Permission |
|---|---|---|
| GET | `/api/v1/controls` | `control:read` |
| POST | `/api/v1/controls` | `control:create` |
| PATCH | `/api/v1/controls/:id` | `control:update` |

### Requirements endpoints

| Method | Path | Permission |
|---|---|---|
| GET | `/api/v1/requirements` | `requirement:read` |
| POST | `/api/v1/requirements` | `requirement:create` |
| POST | `/api/v1/requirements/:id/map` | `requirement:create` |
