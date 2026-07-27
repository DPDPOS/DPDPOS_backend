# DPDPOS Backend

Digital Personal Data Protection Operating System — API and background workers.

**Stack:** TypeScript · Node.js · Express · PostgreSQL + Prisma · Redis · BullMQ · JWT · S3-compatible storage · Docker

## Prerequisites

- Node.js 20+
- Docker Desktop (Postgres, Redis, MinIO)

## Quick start

```bash
# 1. Install dependencies
npm install

# 2. Start infrastructure
npm run docker:up

# 3. Copy env (already present for local; use .env.example as template)
cp .env.example .env

# 4. Generate Prisma client and apply migrations
npx prisma generate
npx prisma migrate dev

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

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | API with hot reload |
| `npm run dev:worker` | Worker with hot reload |
| `npm run build` | Compile TypeScript |
| `npm run test` | Run Vitest |
| `npm run docker:up` | Start Postgres, Redis, MinIO |
| `npm run prisma:migrate` | Create/apply migrations |
| `npm run prisma:seed` | Seed demo data |

## Developer ownership

See `dpdpos-progress-tracker.xlsx` and `docs/09_developer_a_implementation_plan.md`.

- **Developer A:** auth, users, roles, organizations, departments, framework, controls, requirements, outbox infra
- **Developer B:** inventory, consent, rights, validations, violations, remediation
- **Developer C:** evidence, reports, analytics, notifications, ai, audit

## Architecture

Full conventions live in `docs/architecture.md`.
