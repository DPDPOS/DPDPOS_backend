# DPDPOS — Free-tier deployment guide

**Audience:** someone deploying the full stack (backend API, background worker, frontend console, evidence storage, and the `dpdp-cli` npm package) with **no paid cloud bill**.  
**Last updated:** 2026-08-15  
**Repos goal:** a working public URL for the console + API, seeded demo admin, optional Microsoft Entra SSO, and CLI scans that talk to the deployed API.

---

## 0. What you will deploy

| Component | Repo | Free service (recommended) | What it does |
|---|---|---|---|
| Web console | `dpdpos` | **Vercel** Hobby | Next.js UI |
| REST API | `dpdpos_backend` | **Render** Free Web Service | Express `/api/v1` |
| Background worker | `dpdpos_backend` | **same Render web service** (`npm run start:api-and-worker`) | BullMQ jobs, outbox, event bus |
| PostgreSQL | — | **Neon** Free | Primary database (Prisma) |
| Redis | — | **Upstash** Free | Sessions/state, queues, OIDC exchange codes |
| Object storage | — | **Cloudflare R2** Free | Assessment documents / evidence (S3 API) |
| CLI | `dpdp-cli` | **npmjs.com** public package | `dpdp` scanner binary |
| Optional SSO | — | **Microsoft Entra ID** free tenant | Sign in with Microsoft |

```text
Browser ──► Vercel (frontend)
               │  /api/* rewrite
               ▼
            Render API + worker ──► Neon Postgres
               │                 └──► Upstash Redis
               │                 └──► object storage
CLI (npm) ──► Render API  (Bearer dpdp_… token)
```

### Free-tier limits you must accept

- **Render Free** web services **sleep after ~15 minutes** of no traffic. First request after sleep can take 30–60+ seconds.
- **Neon Free** may suspend idle databases; first query after wake is slower.
- **Upstash Free** has request/day and storage caps — fine for demos, not heavy production.
- **R2 Free** has generous egress; still create only one small bucket for demos.
- Do **not** put production PII on free tiers without reviewing each provider’s DPA / region.

---

## 1. Accounts and prerequisites

Create free accounts (one email is enough for everything):

1. [GitHub](https://github.com) — push all three repos (or forks).
2. [Neon](https://neon.tech)
3. [Upstash](https://upstash.com)
4. [Cloudflare](https://dash.cloudflare.com) (for R2)
5. [Render](https://render.com)
6. [Vercel](https://vercel.com)
7. [npmjs.com](https://www.npmjs.com) — for publishing `dpdp-cli`
8. Optional: [Azure Portal](https://portal.azure.com) — Entra app registration

**Local machine tools:**

- Node.js **20+** (`node -v`)
- `git`
- Ability to generate long secrets (PowerShell / OpenSSL)

Generate secrets once (PowerShell):

```powershell
# Two independent JWT secrets (min 32 characters each)
-join ((48..57 + 65..90 + 97..122) | Get-Random -Count 48 | ForEach-Object {[char]$_})
-join ((48..57 + 65..90 + 97..122) | Get-Random -Count 48 | ForEach-Object {[char]$_})
```

Save them as `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`. Never commit them.

---

## 2. Provision Neon (PostgreSQL)

1. Log in to Neon → **New Project**.
2. Name: `dpdpos`
3. Region: pick one close to you (note the region; keep Redis/R2 nearby if possible).
4. After create, open **Connection details**.
5. Copy the **connection string** that looks like:

```text
postgresql://USER:PASSWORD@ep-xxxx.region.aws.neon.tech/neondb?sslmode=require
```

6. Append Prisma schema if missing:

```text
.../neondb?sslmode=require&schema=public
```

Store as `DATABASE_URL`.

**Tip:** In Neon, enable **connection pooling** for serverless if offered; for Render long-lived Node processes the **direct** (non-pooler) URL is usually fine. If Prisma shows prepared-statement errors with PgBouncer, use the **direct** host.

---

## 3. Provision Upstash (Redis)

1. Upstash Console → **Redis** → **Create database**.
2. Name: `dpdpos-redis`
3. Type: regional (same region family as Neon if possible).
4. After create, open the database → **REST / Redis** tab.
5. Copy the **Redis URL** (`rediss://default:…@….upstash.io:6379`) — TLS URL preferred.

Store as `REDIS_URL`.

OIDC SSO **requires** Redis (exchange codes and PKCE state). Without Redis, Microsoft login will fail after redirect.

---

## 4. Provision Cloudflare R2 (S3-compatible storage)

1. Cloudflare Dashboard → **R2 Object Storage** → **Create bucket**.
2. Bucket name: `dpdpos-evidence` (must match `S3_BUCKET` later).
3. Create **R2 API Token**:
   - Manage R2 API Tokens → **Create API token**
   - Permissions: Object Read & Write on that bucket (or account R2)
   - Copy **Access Key ID** and **Secret Access Key** once.
4. Find your **S3 API endpoint**. It looks like:

```text
https://<ACCOUNT_ID>.r2.cloudflarestorage.com
```

Account ID is on the R2 overview page.

5. Environment mapping:

| DPDPOS env | R2 value |
|---|---|
| `S3_ENDPOINT` | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` |
| `S3_REGION` | `auto` |
| `S3_ACCESS_KEY` | Access Key ID |
| `S3_SECRET_KEY` | Secret Access Key |
| `S3_BUCKET` | `dpdpos-evidence` |
| `S3_FORCE_PATH_STYLE` | `true` |

**Do not** use a custom domain until the API is healthy; path-style + account endpoint is enough for demos.

---

## 5. Deploy the backend API on Render

### 5.1 Push the backend repo

Ensure `dpdpos_backend` is on GitHub (public or private). Render Free can deploy from GitHub.

### 5.2 Create a Web Service

1. Render Dashboard → **New** → **Web Service**.
2. Connect the `dpdpos_backend` repository.
3. Settings:

| Field | Value |
|---|---|
| Name | `dpdpos-api` |
| Region | closest to Neon |
| Runtime | **Node** |
| Build Command | `npm install && npx prisma generate && npm run build` |
| Start Command | `npx prisma migrate deploy && npm run start` |
| Instance type | **Free** |

4. **Health check path:** `/healthz`

### 5.3 Environment variables (API)

In Render → Environment, add **exactly**:

```env
NODE_ENV=production
PORT=10000
LOG_LEVEL=info

DATABASE_URL=<neon connection string with ?sslmode=require&schema=public>
REDIS_URL=<upstash rediss://… URL>

JWT_ACCESS_SECRET=<48+ char secret>
JWT_REFRESH_SECRET=<different 48+ char secret>
JWT_ACCESS_TTL_SECONDS=900
JWT_REFRESH_TTL_SECONDS=604800

S3_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
S3_REGION=auto
S3_ACCESS_KEY=<r2 access key>
S3_SECRET_KEY=<r2 secret>
S3_BUCKET=dpdpos-evidence
S3_FORCE_PATH_STYLE=true

OUTBOX_POLL_INTERVAL_MS=2000

# Fill these AFTER you know your Render + Vercel URLs (step 5.4 + 7)
API_PUBLIC_URL=https://dpdpos-api.onrender.com
FRONTEND_PUBLIC_URL=https://dpdpos.vercel.app

# Optional AI — leave blank for demos
# Server-side Groq API for CLI evidence classification (dpdp-cli --ai)
# The CLI NEVER receives this key; classification happens server-side.
AI_API_KEY=
AI_BASE_URL=https://api.groq.com/openai/v1
AI_MODEL=allam-2-7b
AI_MAX_TOKENS=1024
```

**Notes:**

- Render often injects `PORT`; if the UI already sets `PORT`, do not fight it — our server binds `0.0.0.0` and reads `PORT`. Free web services commonly use `10000`.
- `API_PUBLIC_URL` must be the **public HTTPS** URL of this web service (no trailing slash).
- `FRONTEND_PUBLIC_URL` must be the **Vercel** site URL (set after step 7; you can redeploy).

### 5.4 First deploy checks

1. Wait for the first deploy to finish (cold build can take several minutes).
2. Open `https://<your-api>.onrender.com/healthz`  
   Expect: `{ "success": true, "data": { "status": "ok" } }` (envelope shape may wrap `status`).
3. Open `https://<your-api>.onrender.com/readyz`  
   Expect database + Redis ready. If this fails, fix `DATABASE_URL` / `REDIS_URL` before continuing.
4. Copy the service URL → this is `API_PUBLIC_URL`.

### 5.5 Seed the demo organization

Render Free shells are limited. Prefer a **one-off** from your laptop against production DB **only if you accept that risk**, or add a temporary Render **Job**.

**Safer demo approach (from your PC, using production `DATABASE_URL` temporarily):**

```bash
cd dpdpos_backend
# Use a local .env.production that points DATABASE_URL at Neon (do not commit)
npx prisma migrate deploy
npx prisma db seed
```

Or on Render: **Shell** (if available on your plan) / one-off:

```bash
npx prisma migrate deploy
npm run prisma:seed
```

Demo credentials after seed:

| Field | Value |
|---|---|
| Organization ID | `00000000-0000-4000-8000-000000000001` |
| Email | `admin@demo.dpdpos.local` |
| Password | `ChangeMe123!` |

Change the password after first login in any shared environment.

---

## 6. Background worker (assessments)

The API process starts the **outbox relay**, but **BullMQ job processors** (assessments, notifications, AI jobs) live in `npm run start:worker`.

Render **Background Worker** has **no Free instance** (Starter is paid). For a free demo, run the worker **inside the existing web service**.

On `dpdpos-api`, change **Start Command** to:

```text
npx prisma migrate deploy && npm run start:api-and-worker
```

Redeploy. Logs should show both `api.listening` and `worker.ready`.

Jobs only run while the Free web service is awake (it sleeps after ~15 minutes idle). That is enough for a demo.

Paid option: a separate Background Worker with start command `npm run start:worker` and the same env vars as the API.

### MFA email delivery (Amazon SES)

For production, deploy the API and worker independently. They share the same managed Redis, but only the worker consumes the `email-critical` BullMQ queue and connects to SES. The flow is: frontend -> API -> Redis MFA challenge -> `email-critical` -> worker -> Amazon SES SMTP -> user. Do not deploy an SMTP server or MailHog in production.

Add these variables to both the API and worker deployments (values must be managed as deployment secrets):

```env
EMAIL_PROVIDER=SES_SMTP
SMTP_HOST=
SMTP_PORT=
SMTP_SECURE=
SMTP_REQUIRE_AUTH=
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=
EMAIL_WORKER_CONCURRENCY=
EMAIL_RATE_LIMIT_MAX=
EMAIL_RATE_LIMIT_DURATION_MS=
```

`EMAIL_WORKER_CONCURRENCY` controls parallel processing within one worker. `EMAIL_RATE_LIMIT_MAX` and `EMAIL_RATE_LIMIT_DURATION_MS` use BullMQ's Redis-backed global limiter, so scaling workers does not multiply the SES send rate. Set them from the SES quota for the chosen region; do not hardcode a quota in application code.

SES setup still required outside this repository:

1. Choose the SES region and verify the sender address or domain.
2. Configure DKIM and SPF/DNS for that domain.
3. Create SES SMTP credentials (these are not normal AWS console credentials).
4. Request SES production access if the account is in the SES sandbox.
5. Put SMTP credentials only in the deployment secret store.

Troubleshooting: a growing `email-critical` queue usually means the worker is stopped or SES is failing; SES authentication errors are terminal until configuration is corrected; throttling is retried and means the global limiter should be lowered; emails to unverified recipients in the SES sandbox will not be delivered. OTP jobs contain a plaintext code only while queued, then are retained for at most 10 minutes after success and one hour after failure.

---

## 7. Deploy the frontend on Vercel

### 7.1 Project

1. Vercel → **Add New Project** → import `dpdpos` (frontend repo).
2. Framework preset: **Next.js**.
3. Root directory: repo root.
4. Build: default (`npm run build`).
5. Node.js version: **20.x** (Project Settings → General).

### 7.2 Environment variables

| Name | Value | Notes |
|---|---|---|
| `BACKEND_URL` | `https://<your-api>.onrender.com` | Used by Next.js **rewrites** at build/runtime for `/api/*` → backend `/api/v1/*` |
| `NEXT_PUBLIC_API_BASE_URL` | leave **empty** | Keep using same-origin `/api` proxy (cookies/CORS stay simple) |

Do **not** point the browser at Render directly unless you intentionally configure CORS and absolute URLs everywhere. The rewrite model is the supported path.

### 7.3 Deploy and wire URLs

1. Deploy → note the URL, e.g. `https://dpdpos.vercel.app`.
2. Go back to Render **API** + **Worker** → set:

```env
API_PUBLIC_URL=https://<your-api>.onrender.com
FRONTEND_PUBLIC_URL=https://dpdpos.vercel.app
```

3. **Manual Deploy** both API and worker so OIDC redirects and CLI mint instructions pick up the new URLs.

### 7.4 Smoke-test the console

1. Open `https://dpdpos.vercel.app/login`.
2. Organization ID: `00000000-0000-4000-8000-000000000001`
3. Email / password: demo admin.
4. Confirm dashboard loads.
5. Open DevTools → Network: calls should go to `/api/...` on the Vercel host (rewritten server-side to Render).

**Cold start:** if the first login hangs, wait for Render to wake (`/healthz` in another tab), then retry.

---

## 8. Configure Microsoft Entra SSO (optional but recommended)

Use this only after `API_PUBLIC_URL` and `FRONTEND_PUBLIC_URL` are HTTPS production URLs.

### 8.1 App registration

1. Azure Portal → **App registrations** → **New registration**.
2. Name: `DPDPOS Production`.
3. Supported account types: single tenant (or multi as needed).
4. Redirect URI — platform **Web**:

```text
https://<your-api>.onrender.com/api/v1/auth/oidc/callback
```

Must match `API_PUBLIC_URL` + `/api/v1/auth/oidc/callback` exactly (HTTPS, no trailing slash on the host).

5. Certificates & secrets → **New client secret** → copy **Value**.
6. Overview → copy **Application (client) ID** and **Directory (tenant) ID**.
7. API permissions:

| Permission | Type | Consent |
|---|---|---|
| `User.Read` | Delegated | Grant admin consent |
| `GroupMember.Read.All` | Delegated | Grant admin consent |
| `GroupMember.Read.All` | Application | Grant admin consent (for Sync) |

### 8.2 Configure in DPDPOS UI

1. Sign in as demo **ORG_ADMIN**.
2. **Settings → Directory identity**.
3. Mode: `OIDC_ENTRA` or `HYBRID`.
4. Default role for JIT: `MEMBER`.
5. JIT on; Enforce SSO **off** until Microsoft login works.
6. Add Entra provider:

| Field | Value |
|---|---|
| Issuer | `https://login.microsoftonline.com/<TENANT_ID>/v2.0` |
| Tenant ID | directory ID |
| Client ID | application ID |
| Client secret | secret value |

7. **Save Entra provider** → **Enable group scopes**.
8. Log out → login page → org ID → **Sign in with Microsoft**.

### 8.3 Group → role maps

1. Entra → create security group (e.g. `DPDPOS-DPO`) → add users → copy **Object ID**.
2. DPDPOS → Directory group → DPDPOS role → map Object ID → role `DPO`.
3. User signs in again (or **Sync Entra groups now**).

---

## 9. Publish and use `dpdp-cli` on npm

### 9.1 Prepare the package

In `dpdp-cli/package.json`:

1. Set `"private": false` when you are ready to publish.
2. Confirm:

```json
"name": "dpdp-cli",
"bin": { "dpdp": "./dist/index.js" },
"files": ["dist"]
```

3. Ensure `dist/index.js` has a shebang after build (`#!/usr/bin/env node`) — Commander CLIs usually need this in the compiled entry (add if missing before publish).
4. Build:

```bash
cd dpdp-cli
npm install
npm run build
npm test
```

### 9.2 Publish (public, free)

```bash
npm login
npm publish --access public
```

If the name `dpdp-cli` is taken, rename under a scope: `@yourorg/dpdp-cli` and update assessment UI / README strings.

### 9.3 End-user flow against production

1. In the deployed console → Assessments → CLI → **Generate CLI token**.
2. Commands will include your production `API_PUBLIC_URL` (because the API uses `appConfig.apiPublicUrl`).
3. On any laptop:

```bash
npm install -g dpdp-cli
dpdp login --token dpdp_… --api https://<your-api>.onrender.com
dpdp configure --assessment <uuid>
dpdp scan ./path-to-customer-code
dpdp evidence
dpdp submit
dpdp status
```

Without global install:

```bash
npx -p dpdp-cli dpdp login --token dpdp_… --api https://<your-api>.onrender.com
```

---

## 10. Post-deploy verification checklist

Work through in order:

| # | Check | How |
|---|---|---|
| 1 | API live | `GET /healthz` → 200 |
| 2 | Dependencies | `GET /readyz` → database + redis true |
| 3 | Migrations | `prisma migrate deploy` ran on API start |
| 4 | Seed | Demo admin can password-login |
| 5 | Frontend proxy | Browser Network shows `/api/auth/login` on Vercel host succeeding |
| 6 | Worker | Render worker logs `worker.ready` |
| 7 | R2 | Upload an assessment document; no S3 credential errors in API logs |
| 8 | Redis SSO | Microsoft login completes to dashboard (if Entra configured) |
| 9 | CLI | `dpdp login` + `scan` + `submit` against production API |
| 10 | Roles | Entra group map or default JIT role grants non-zero permissions |

---

## 11. Environment reference (single source)

### Backend (`dpdpos_backend`)

| Variable | Required | Purpose |
|---|---|---|
| `NODE_ENV` | yes | `production` |
| `PORT` | yes | Render sets this |
| `DATABASE_URL` | yes | Neon |
| `REDIS_URL` | yes | Upstash |
| `JWT_ACCESS_SECRET` | yes | ≥32 chars |
| `JWT_REFRESH_SECRET` | yes | ≥32 chars, different |
| `S3_*` | yes | R2 |
| `API_PUBLIC_URL` | yes | Public API HTTPS origin |
| `FRONTEND_PUBLIC_URL` | yes | Vercel HTTPS origin |
| `AI_*` | no | Optional |

### Frontend (`dpdpos`)

| Variable | Required | Purpose |
|---|---|---|
| `BACKEND_URL` | yes | Render API origin for rewrites |
| `NEXT_PUBLIC_API_BASE_URL` | no | Leave empty for `/api` proxy |

### CLI (`dpdp-cli`)

No deploy-time env. Runtime:

| Flag / config | Purpose |
|---|---|
| `--api` / stored config | Points at `API_PUBLIC_URL` |
| `dpdp_…` token | Assessment-scoped Bearer |

---

## 12. Local vs production mapping

| Local Docker | Production free tier |
|---|---|
| `docker-compose` Postgres | Neon |
| `docker-compose` Redis | Upstash |
| MinIO `:9000` | Cloudflare R2 |
| `npm run dev` API | Render Web Service |
| `npm run dev:worker` | Render Background Worker |
| `npm run dev` Next `:3001` | Vercel |
| `npx tsx src/index.ts` | `npm i -g dpdp-cli` → `dpdp` |

---

## 13. Common failures

| Symptom | Fix |
|---|---|
| Vercel `/api/*` 502 / timeout | Render asleep — hit `/healthz`, wait, retry; or upgrade Render |
| `readyz` Redis fail | Wrong `REDIS_URL`; use `rediss://` for Upstash |
| Prisma migrate SSL error | Add `?sslmode=require` to Neon URL |
| S3 upload fails | Wrong R2 endpoint/account id; `S3_FORCE_PATH_STYLE=true` |
| Entra `AADSTS50011` | Redirect URI must equal `{API_PUBLIC_URL}/api/v1/auth/oidc/callback` |
| SSO exchange expired | Redis down/misconfigured; or refreshed `/login/sso` page |
| CLI login fails | Token expired; API URL must be HTTPS production origin |
| Worker idle forever | Worker service not deployed or different Redis than API |
| Demo login works, Microsoft user has 0 roles | Set default JIT role `MEMBER` and/or group maps; sign in again |

---

## 14. Security hardening after the demo works

1. Change demo admin password or disable the seed user.
2. Rotate JWT secrets if they ever leaked in logs/screenshots.
3. Keep **Enforce SSO** off until break-glass is verified.
4. Restrict Entra app to your tenant; prefer admin consent.
5. Do not commit `.env` / `.env.local` / R2 keys.
6. When leaving free tier: move Postgres/Redis to always-on plans before customer data.

---

## 15. Suggested deploy order (do not skip)

1. Neon + Upstash + R2 (data plane)  
2. Render API + migrate + seed  
3. Render Worker  
4. Vercel frontend + `BACKEND_URL`  
5. Set `API_PUBLIC_URL` / `FRONTEND_PUBLIC_URL` → redeploy API/worker  
6. Smoke password login  
7. Optional Entra  
8. Publish CLI → mint token from UI → scan  

---

## 16. Related docs

- Backend local setup: repo root `README.md`
- Identity / Entra plan: `docs/13_identity_ad_entra_integration_plan.md`
- Assessment + CLI testing: `docs/11_assessment_cli_testing_guide.md`
- Frontend plan: frontend repo `implementation.md`
- CLI usage: `dpdp-cli` `README.md`

---

*End of deployment guide.*
