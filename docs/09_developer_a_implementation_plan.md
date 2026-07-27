# Developer A — Detailed Implementation Plan

**Project:** DPDPOS Backend  
**Owner:** Developer A  
**Document date:** 2026-07-27  
**Source of truth:** `dpdpos-progress-tracker.xlsx` + `docs/architecture.md`

---

## 1. Scope you own

| Module | Branch prefix | Depends on |
|---|---|---|
| organizations | `feature/a/organizations` | *(root)* |
| roles | `feature/a/roles` | organizations |
| users | `feature/a/users` | organizations, roles |
| auth | `feature/a/auth` | users, roles |
| departments | `feature/a/departments` | organizations, users |
| framework | `feature/a/framework` | organizations |
| controls | `feature/a/controls` | framework |
| requirements | `feature/a/requirements` | framework, controls |
| outbox / event-relay / retention-queue | shared infra | all writers |

You also own freezing **Phase 0 contracts** (permission catalog, `RequestContext`, base events) so Developers B and C can build in parallel.

---

## 2. Dependency graph

```text
Phase 0 contracts
    └─ organizations
         ├─ roles ──┐
         ├─ users ──┼─ auth (guard contract first, then full JWT/MFA)
         └─ departments  → unblocks Dev B inventory FK
         └─ framework
              ├─ controls  → read API unblocks Dev B validations + Dev C evidence
              └─ requirements
```

---

## 3. Week 0 — Foundation (Jul 27–28) — DONE in this setup

- [x] Toolchain (`package.json`, TypeScript, env, README)
- [x] Docker Compose: Postgres, Redis, MinIO
- [x] Shared kernel: errors, middleware, guards, `BaseRepository`, pagination
- [x] Permission catalog + domain event names
- [x] Outbox table + relay skeleton
- [x] Prisma models for Dev A tables + seed
- [x] Module route/service stubs for all Dev A APIs
- [x] Health: `/healthz`, `/readyz`

**Branch:** `feature/shared/contracts-kickoff` (merge first)

---

## 4. Wave 1 — Core platform (Jul 27 – Aug 4)

### 4.1 Organizations (Jul 27–30)

**Branch:** `feature/a/organizations/tenant-crud`  
**Endpoints:**

| Method | Path | Permission |
|---|---|---|
| POST | `/api/v1/organizations` | `organization:create` |
| GET | `/api/v1/organizations/:id` | `organization:read` |
| PATCH | `/api/v1/organizations/:id` | `organization:update` |

**Table:** `organizations`  
**Event:** `OrganizationCreated` (outbox in same transaction)  
**Acceptance:**

- Onboarding fields from PRD (name, industry, region, maturity, SDF flag)
- Soft-delete aware reads
- Seeds system roles on create (ORG_ADMIN, DPO, COMPLIANCE_OFFICER, AUDITOR, MEMBER)

### 4.2 Roles (Jul 27–31)

**Branch:** `feature/a/roles/permission-catalog`  
**Endpoints:**

| Method | Path | Permission |
|---|---|---|
| GET | `/api/v1/roles` | `role:read` |
| POST | `/api/v1/roles` | `role:create` |
| PATCH | `/api/v1/roles/:id/permissions` | `role:update_permissions` |

**Tables:** `roles`, `user_roles`  
**Events:** `RoleAssigned`, `RolePermissionsChanged`  
**Acceptance:**

- Permissions are only strings from `PERMISSIONS` catalog (reject unknown)
- System roles cannot be deleted
- Permission set cache invalidation hook (Redis key per user session) ready for auth

### 4.3 Users (Jul 27–31)

**Branch:** `feature/a/users`  
**Endpoints:**

| Method | Path | Permission |
|---|---|---|
| GET | `/api/v1/users` | `user:read` |
| POST | `/api/v1/users` | `user:create` / `user:invite` |
| PATCH | `/api/v1/users/:id` | `user:update` |

**Table:** `users`  
**Event:** `UserInvited`  
**Acceptance:**

- Unique `(organizationId, email)`
- Never return `passwordHash`
- Invite flow sets status `INVITED` until first login

### 4.4 Auth — split into two PRs

#### PR A — Contract & guard (priority — blocks B/C)

**Branch:** `feature/a/auth/contract-and-guard`  
**Deliverables:**

- `RequestContext` attached on authenticated routes
- `authGuard` + `requirePermission(...)` wired on protected routers
- Document how other modules declare required permissions

#### PR B — Full session (Jul 27 – Aug 3)

**Branch:** `feature/a/auth`  
**Endpoints:**

| Method | Path | Notes |
|---|---|---|
| POST | `/api/v1/auth/login` | access + refresh |
| POST | `/api/v1/auth/logout` | revoke refresh + deny-list access jti |
| POST | `/api/v1/auth/refresh` | rotate refresh |
| GET | `/api/v1/auth/me` | current user + permissions |

**Table:** `refresh_sessions`  
**Event:** `UserLoggedIn`  
**Acceptance:**

- Access TTL ~15m, refresh 7d, Argon2 password verify
- Redis revoke list for logout
- MFA TOTP required for ORG_ADMIN / DPO / AUDITOR (can follow immediately after basic JWT)

### 4.5 Departments (Jul 31 – Aug 4)

**Branch:** `feature/a/departments/core-crud`  
**Endpoints:**

| Method | Path | Permission |
|---|---|---|
| GET | `/api/v1/departments` | `department:read` |
| POST | `/api/v1/departments` | `department:create` |

**Table:** `departments`  
**Event:** `DepartmentCreated`  
**Acceptance:** Unique name per org; optional `headUserId`; **must merge before Dev B inventory migration**

---

## 5. Wave 2 — Governance (Aug 10–26)

### 5.1 Framework (Aug 10–19)

**Branch:** `feature/a/framework`  
**Endpoints:**

| Method | Path | Permission |
|---|---|---|
| POST | `/api/v1/framework/generate` | `framework:generate` |
| GET | `/api/v1/framework/roadmap` | `framework:read` |

**Table:** `frameworks` (+ generated controls/requirements)  
**Event:** `FrameworkPublished`  
**Generate inputs:** industry, maturity, sensitivity, department count, processors, SDF flag  
**Outputs:** control list, obligations, roadmap JSON, owners, due dates  
**Unblock:** expose read interface early for Dev B validations + Dev C AI

### 5.2 Controls (Aug 17–24)

**Branch:** `feature/a/controls`  
**Endpoints:** GET/POST/PATCH `/api/v1/controls`  
**Table:** `controls`  
**Event:** `ControlUpdated`  
**Unblock:** Dev C evidence maps to controls; Dev B validations read controls

### 5.3 Requirements (Aug 19–26)

**Branch:** `feature/a/requirements`  
**Endpoints:** GET/POST `/api/v1/requirements`  
**Table:** `requirements`  
**Event:** `RequirementMapped`

---

## 6. Shared infra checklist (ongoing)

| Item | Status target |
|---|---|
| `outbox_events` writes on every mutating service | every Wave 1/2 PR |
| Outbox relay → event bus (BullMQ) | Week 0 skeleton → harden with first producer |
| `event-relay-queue` | Dev A |
| `retention-queue` registration | Dev A owns queue; B/C own consumers |

---

## 7. Merge order (drive these)

1. `feature/shared/contracts-kickoff`
2. `feature/a/organizations/tenant-crud`
3. `feature/a/auth/contract-and-guard`
4. `feature/a/roles/permission-catalog`
5. `feature/a/departments/core-crud`
6. `feature/a/users` + `feature/a/auth` (full JWT)
7. `feature/a/framework` → `controls` → `requirements`

Reviewers per tracker: B and C review org/auth; B reviews roles/departments.

---

## 8. API Tracker — your 22 endpoints

### Auth (4)
- POST `/api/v1/auth/login`
- POST `/api/v1/auth/logout`
- POST `/api/v1/auth/refresh`
- GET `/api/v1/auth/me`

### Users (3)
- GET `/api/v1/users`
- POST `/api/v1/users`
- PATCH `/api/v1/users/:id`

### Roles (3)
- GET `/api/v1/roles`
- POST `/api/v1/roles`
- PATCH `/api/v1/roles/:id/permissions`

### Organizations (3)
- POST `/api/v1/organizations`
- GET `/api/v1/organizations/:id`
- PATCH `/api/v1/organizations/:id`

### Departments (2)
- GET `/api/v1/departments`
- POST `/api/v1/departments`

### Framework (2)
- POST `/api/v1/framework/generate`
- GET `/api/v1/framework/roadmap`

### Controls (3)
- GET `/api/v1/controls`
- POST `/api/v1/controls`
- PATCH `/api/v1/controls/:id`

### Requirements (2)
- GET `/api/v1/requirements`
- POST `/api/v1/requirements`

---

## 9. Events you publish

| Event | Publisher | Consumers |
|---|---|---|
| OrganizationCreated | organizations | notifications, audit |
| UserInvited | users | notifications, audit |
| RoleAssigned | roles | audit |
| RolePermissionsChanged | roles | audit |
| DepartmentCreated | departments | audit |
| FrameworkPublished | framework | analytics, audit |
| ControlUpdated | controls | audit |
| RequirementMapped | requirements | audit |
| UserLoggedIn | auth | audit |

---

## 10. Engineering rules (non-negotiable)

1. Every query is tenant-scoped via `BaseRepository` / `organizationId`.
2. Cross-module side effects go through **outbox → events**, never direct service imports of `notifications` / `audit`.
3. Other modules may only import your `index.ts` public surface.
4. DTOs are zod-first; never accept `organizationId` / `createdBy` from the client body.
5. Update **Feature Progress** and **Merge Checklist** tabs at end of day.
6. Keep Feature / Module names identical across tracker tabs.

---

## 11. Definition of done for Developer A stream

- [ ] All 22 endpoints implemented with tests
- [ ] All Dev A tables migrated; seed demo org works
- [ ] Outbox events relayed for every mutation
- [ ] Auth guard + permission catalog consumed by B/C
- [ ] Departments merged before inventory FK
- [ ] Controls read API available before validations
- [ ] Integration Tracker: Ready / Integrated / Tested = Yes for your 8 modules

---

## 12. Suggested daily cadence (Wave 1 week)

| Day | Focus |
|---|---|
| Mon Jul 27 | Merge contracts; start organizations CRUD |
| Tue Jul 28 | Finish organizations + outbox write path |
| Wed Jul 29 | Roles + permission catalog freeze |
| Thu Jul 30 | Users invite + auth guard contract PR |
| Fri Jul 31 | Departments CRUD (unblock B) |
| Mon–Wed Aug 3 | Full JWT auth + refresh + `/me` |
| Aug 10+ | Framework generate → controls → requirements |

---

## 13. Local commands

```bash
npm install
npm run docker:up
npx prisma migrate dev
npm run prisma:seed
npm run dev
npm run dev:worker
```

Demo seed credentials (local only): `admin@demo.dpdpos.local` / `ChangeMe123!`
