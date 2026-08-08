# Assessment / CLI spine — testing guide (FE-first)

## Product loop

```text
Frontend /assessments/:id onboarding → documents → questionnaire → CLI token
  → dpdp-cli scan/submit → Evaluate → Version / audit
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
  Org: `00000000-0000-4000-8000-000000000001`

## Evaluator path (full-page onboarding)

1. Open **Assessments** → **New assessment** (navigates to `/assessments/:id`)
2. **Documents** — pick document type, upload a policy file, optionally paste **extracted text** for PDFs → **Continue**
3. **Questionnaire** — answer one question at a time (auto-saves + advances). Use answer history to jump back → **Continue**
4. **CLI scan** → **Generate CLI token** → copy commands
5. In `E:\projects\dpdpos\dpdp-cli` run `login` / `configure` / `scan` / `submit`
6. Back in UI: **Refresh** scan jobs (expect `COMPLETED`, findings > 0) → **Continue**
7. **Evaluate** → **Evaluate controls** → review score → **Continue**
8. **Version** → create a version label if rescanning later → **Finish**
9. Soft incomplete steps show a warning; use **Skip for now** to continue without blocking

Re-opening an assessment resumes at the first incomplete step on the full-page flow.

## Automated backend spine test

```powershell
cd E:\projects\dpdpos\dpdpos_backend
npm run test:spine
```

## What good looks like

- Full-page onboarding with left step rail; Back / Continue footer drives the flow
- Documents: file upload + optional extracted text; initiate → storage PUT → confirm (MinIO)
- Questionnaire stages auto-advance; history lists saved answers for the current version
- CLI token starts with `dpdp_` and is minted from the frontend
- Scan job `findingsAccepted` / `findingsCount` > 0
- Evaluate returns numeric score + per-control status (document types feed control mapping)
- Report summary has pass/partial/fail counts
- New version increments `currentVersion`
- Audit events are hash-chained
