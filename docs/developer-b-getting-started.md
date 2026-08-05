# Developer B — Getting Started Guide

**Your stream:** Discovery, Validation & Enforcement
**Your modules, in build order:** `inventory` → `consent` → `rights` → `validations` → `violations` → `remediation`

---

## 0. Your first three actions today

1. Get (or stub) the four Phase 0 contracts from Dev A — see §2. Don't wait on the real implementation, only the *shape*.
2. `docker-compose up postgres redis` locally, `npx prisma migrate dev`, confirm you can hit an empty DB.
3. Start `inventory` — it's the only one of your six modules with **zero external blockers**. Everything below assumes you begin there.

---

## 1. One-time environment setup

```bash
git clone <repo>
cd dpdpos-backend
npm install
cp .env.example .env          # fill in DATABASE_URL, REDIS_URL, JWT_SECRET (dev value), S3 vars (can stay blank for now)
docker-compose -f docker/docker-compose.yml up -d postgres redis
npx prisma generate
npx prisma migrate dev
npm run dev                    # confirms the app boots before you write anything
```

If the repo doesn't exist yet, run `generate-dpdpos-structure.sh` once (from the earlier deliverable) to lay down the folder tree, then `git init` / push it as the shared starting point everyone clones from.

---

## 2. Confirm the Phase 0 contracts you need from Dev A

You are written against these four shapes from day one, whether or not Dev A's real implementation has landed yet:

| Contract | What you need from it | If it isn't ready yet |
|---|---|---|
| `RequestContext` | `{ organizationId, actorId, correlationId, permissions[] }` — every service method of yours takes one of these, never `req`/`res` | Stub it yourself in `src/shared/types/request-context.ts` with this exact shape; swap the import for the real one later — no code change needed if the shape matches |
| `BaseRepository<T>` | Tenant-scoped `findById`, `findMany`, `create`, `update`, `softDelete`, pagination baked in | Write your six repositories against the *interface*, with a minimal local implementation if Dev A's isn't merged — same reasoning |
| Response envelope + `AppError` hierarchy | `{ success, data, meta }` / `{ success:false, error }`, and `ValidationError`/`NotFoundError`/`ConflictError` classes | Copy the shape from the architecture doc §18 if not merged yet |
| `BaseEvent<T>` + event bus `publish()`/`subscribe()` | Your `validations`, `violations`, and `remediation` all publish events on this envelope | You can build `inventory`, `consent`, and `rights` fully before you need this — don't block on it early |

Do not build your own divergent version of any of these "just to get moving" — a shape mismatch here is the one thing that turns your Phase-3 merge into a rewrite instead of a `git pull`.

---

## 3. Why this build order

```
inventory  →  consent  →  rights  →  validations  →  violations  →  remediation
(no deps)     (needs        (needs        (needs all three          (needs
              inventory)    org/users     Discovery modules          validations)
                            contract      + framework/controls
                            only)         read-only, for
                                          traceability only)
```

- **`inventory` first** — no dependency on anything you don't already control.
- **`consent` next** — its notices/consent records reference the data assets and purposes `inventory` just created, so building it second means no mocking.
- **`rights`** — genuinely independent of `inventory`/`consent`; you could build it in parallel or even first if you want a quick, self-contained win, but doing it third keeps you in one mental model (Discovery data) before you shift into the rule engine.
- **`validations`** — needs all three Discovery modules to exist because a real rule ("notice present," "consent withdrawn correctly," "retention expired") reads across them. It also references `framework`/`controls` by ID for traceability only — that's a read-only lookup, not something that blocks your core evaluation logic. Build the rule engine against your own data first; wire the control-ID lookup in once Dev A's `ControlsService.getById()` lands (Phase 2, per the tracker).
- **`violations`** — depends only on `validations` publishing `ValidationFailed`, and that's your own module publishing to your own module, so there's no cross-team wait here at all.
- **`remediation`** — the simplest of the six, and depends only on `violations` existing.

---

## 4. The end-to-end recipe — build one module this way

Worked example: **`inventory`**, since it's first and has no blockers. Repeat this same sequence for all six modules.

**4.1 — Prisma model** (your own delimited block in `prisma/schema.prisma`)
```prisma
// ---- Dev B: Discovery ----
model DataAsset {
  id               String   @id @default(cuid())
  organizationId   String
  departmentId     String?
  assetName        String
  assetType        String
  category         String
  sensitivity      String
  ownerUserId      String?
  storageLocation  String?
  retentionPeriod  String?
  status           String   @default("active")
  deletedAt        DateTime?
  createdBy        String
  updatedBy        String
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  @@index([organizationId, status])
}
```
```bash
npx prisma migrate dev --name add_data_assets
```

**4.2 — Repository** (`modules/inventory/repositories/data-asset.repository.ts`) — extends the shared `BaseRepository<DataAsset>`, adds only intention-revealing methods (`findActiveByOrg`, `findByDepartment`) — no raw Prisma calls anywhere else in the module.

**4.3 — Domain (if any state/invariants exist)** — `inventory` doesn't need a full state machine, just a `status` value object (`active | archived`) if you want type safety over the raw string.

**4.4 — DTOs + validators** — one file per operation:
```ts
// modules/inventory/dto/create-data-asset.dto.ts
export const CreateDataAssetSchema = z.object({
  assetName: z.string().min(1),
  assetType: z.string().min(1),
  category: z.string().min(1),
  sensitivity: z.enum(["low", "medium", "high", "critical"]),
  departmentId: z.string().optional(),
  storageLocation: z.string().optional(),
  retentionPeriod: z.string().optional(),
});
export type CreateDataAssetDto = z.infer<typeof CreateDataAssetSchema>;
```

**4.5 — Service** — business rules live here (e.g. reject creation if `departmentId` doesn't belong to the caller's org), calls the repository, and — later, once you need it — writes the outbox event row in the same transaction.

**4.6 — Controller** — a few lines: parse the already-validated DTO, build request context, call the service, return the envelope.

**4.7 — Routes** — mount under `/api/v1/data-assets`; register in `src/bootstrap/register-routes.ts` (one alphabetically-placed line — your one touch to a shared file for this step).

**4.8 — Permissions** — `inventory:read`, `inventory:write`, `inventory:delete` in `modules/inventory/permissions/`.

**4.9 — Tests** — unit test the service (mock the repository interface), integration test the repository against real Postgres.

**4.10 — Update the tracker** — flip `Status` on the Developer Assignment sheet, tick `Migration Complete` on the Database Tracker sheet for `data_assets`, and log progress on Feature Progress.

---

## 5. Module-by-module notes

**`inventory`** — Build `DataAsset` before `ProcessingActivity` (the latter FKs to the former). No blockers — start immediately.

**`consent`** — `Notice` and `ConsentRecord` reference `DataAsset`/purpose by ID. Since you already built `inventory`, this is a direct call to your own repository, not a mock.

**`rights`** — `DataSubjectRequest` needs an `assigned_to` user reference (Dev A's `users`). Use the `RequestContext`/stub user-lookup contract until Dev A's real `UsersService.getById()` lands — swap the import, nothing else changes.

**`validations`** — The biggest piece. Start with the **domain layer first**: rule structure (code, title, severity, pass/fail condition), the evaluation engine, and validation-run/result models — all of this only needs `inventory`/`consent`/`rights` data, which you own. Layer in the read-only `ControlsService.getById()` call last, purely for the `control_id` traceability field — don't let its absence block the rest of the engine.

**`violations`** — Build the **state machine first** (`Open → Triage → Assigned → In Progress → Pending Evidence → Validated → Closed → Archived`) as a pure, unit-testable domain object before wiring it to the `ValidationFailed` event handler.

**`remediation`** — Straightforward CRUD tied to `violation_id`; build right after `violations` since it's the simplest of the six.

---

## 6. What you touch, and what you never touch

- **You own outright:** everything inside `modules/inventory/**`, `modules/consent/**`, `modules/rights/**`, `modules/validations/**`, `modules/violations/**`, `modules/remediation/**`.
- **You import from, never edit:** `modules/organizations/index.ts`, `modules/users/index.ts`, `modules/departments/index.ts`, `modules/framework/index.ts`, `modules/controls/index.ts` (Dev A), and `modules/evidence/index.ts` (Dev C, for the `evidence_required_flag` read).
- **You touch lightly, in small dedicated PRs:** `src/bootstrap/register-routes.ts`, `register-events.ts`, `register-queues.ts` (one line each, alphabetically placed), your own comment block in `prisma/schema.prisma`, and `package.json` if you add a dependency.

---

## 7. Testing as you go

- Unit tests beside the code (`*.spec.ts`) for every service and, critically, for the `validations` rule engine and the `violations`/rights lifecycle state machines — these should be testable with zero database.
- Integration tests against a real local Postgres for every repository.
- Once `validations` → `violations` is wired, write one integration test that runs a failing rule and asserts a `Violation` row gets created — this is the single most important test in your entire stream.

## 8. Keep the tracker current

Update, in this order, whenever you finish a step: **Database Tracker** (migration complete) → **Developer Assignment** (status) → **Feature Progress** (%, stage, blockers) → **Integration Tracker** (ready/integrated/tested) → **Event & Queue Tracker** (once `validations`/`violations`/`remediation` start actually publishing).
