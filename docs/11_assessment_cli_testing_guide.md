# Assessment / CLI spine — testing guide (FE-first)

## Product loop (coherent OS path)

```text
/assessments/:id onboarding
  → Documents (required, prefer extracted text)
  → Questionnaire (required; profile drives N/A + severity)
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
  Org: `00000000-0000-4000-8000-000000000001`

## Evaluator path (full-page onboarding)

1. **Assessments** → **New assessment** → `/assessments/:id`
2. **Documents** (hard gate) — upload file + paste extracted text for PDFs → **Continue**
3. **Questionnaire** (hard gate) — answer all required visible questions → **Continue**
4. **CLI scan** — mint token, run CLI, Refresh until findings (or **Continue anyway** and accept score cap 55)
5. **Evaluate readiness** — score is explicitly *readiness*, not certification  
   - FAIL controls open **Violations** + AUTO **Remediation** tasks
6. **Version** — freezes prior readiness pack into `snapshotJson` → **Finish**
7. Close remediation → re-scan → create/use new version → re-evaluate (score delta story)

## Automated backend spine test

```powershell
cd E:\projects\dpdpos\dpdpos_backend
npm run test:spine
```

## What good looks like

- Documents + questionnaire required before evaluate
- Self-attestation alone cannot PASS; typed docs without text are weak
- Score ceilings without CLI (55) or without searchable policy text (75)
- Evaluate opens violations for FAIL controls
- Version create freezes prior report snapshot
- Audit events remain hash-chained
