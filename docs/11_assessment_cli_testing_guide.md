# Assessment / CLI spine — testing guide (FE-first)

## Product loop (coherent OS path)

```text
Signup / Login
  → Org prerequisite (/onboarding): profile + questionnaire OR Excel (once)
  → /assessments/:id
      → Questionnaire (required; form OR Excel template — docs optional)
      → CLI scan (recommended; score capped at 55 without findings)
      → Evaluate readiness (FAIL → Violations → AUTO remediation)
      → Version freeze → fix → re-scan → re-evaluate
```

Do **not** use the backend static `/demo` page for this story.

## Setup

```powershell
# Backend
cd E:\projects\dpdpos\dpdpos_backend
npm run docker:up
npx prisma migrate deploy
npm run prisma:seed
npm run dev
# other terminal:
npm run dev:worker

# Frontend
cd E:\projects\dpdpos\dpdpos
# .env.local: BACKEND_URL=http://localhost:3000
npm run dev
```

- Frontend: http://localhost:3001/login  
- Seed admin: `admin@demo.dpdpos.local` / `ChangeMe123!`  
  Org: `00000000-0000-4000-8000-000000000001` (demo orgs are pre-marked onboarded)
- New tenants: **Sign up** → complete **/onboarding** before assessments
- Set **Industry** in Settings (or onboarding profile) so the questionnaire includes the sector pack

## Org prerequisite

1. Sign up or sign in (email lookup picks organisation when possible)
2. If `requiresOnboarding`, console routes to **/onboarding**
3. Fill profile + answer questionnaire **or** download Excel template, fill, upload
4. **Complete** — then assessments unlock

## Evaluator path

1. **Assessments** → **New assessment** → `/assessments/:id`  
   (answers seed from completed org onboarding when present)
2. **Questionnaire** (hard gate) — Form **or** Excel (download template / import) → **Continue**
3. **CLI scan** — mint token, run CLI, Refresh until findings (or **Continue anyway** and accept score cap 55)
4. **Evaluate readiness** — score is explicitly *readiness*, not certification  
   - Requires questionnaire answers only (policy document upload is optional)
   - Free-text security/encryption answers feed narrative evidence into the engine
   - FAIL controls open **Violations** + AUTO **Remediation** tasks
5. **Version** — freezes prior readiness pack into `snapshotJson` → **Finish**
6. Close remediation → re-scan → create/use new version → re-evaluate (score delta story)

## Excel endpoints

- Assessment template: `GET /api/v1/assessments/questionnaire/template.xlsx`
- Assessment import: `POST /api/v1/assessments/:id/questionnaire/import` `{ contentBase64 }`
- Onboarding template: `GET /api/v1/onboarding/questionnaire/template.xlsx`
- Onboarding import: `POST /api/v1/onboarding/questionnaire/import` `{ contentBase64 }`

## Automated backend spine test

```powershell
cd E:\projects\dpdpos\dpdpos_backend
npm run test:spine
npx vitest run src/modules/assessments/tests/questionnaire-excel.spec.ts
```

## What good looks like

- Org onboarding once before assessment create
- Questionnaire (form or Excel) required before evaluate; documents not required
- Self-attestation alone cannot PASS; narrative security answers strengthen evidence text
- Score ceilings without CLI (55) or without searchable policy text (75)
- Evaluate opens violations for FAIL controls
- Version create freezes prior report snapshot
- Audit events remain hash-chained
