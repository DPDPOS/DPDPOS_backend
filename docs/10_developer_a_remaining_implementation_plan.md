# Developer A — Remaining Implementation Plan

**Project:** DPDPOS Backend  
**Owner:** Developer A  
**Document date:** 2026-07-27  
**Status:** Week 0 foundation is done — this plan covers **only what is left**  
**Companion:** `docs/09_developer_a_implementation_plan.md` (overview + API/event lists)

---

## 0. Baseline (already done — do not redo)

- Toolchain, Docker, shared kernel, `/healthz` + `/readyz`
- Phase 0: permission catalog, `RequestContext`, auth/permission guard contracts, domain event names
- Outbox table + relay skeleton
- Dev A Prisma models + demo seed
- Stub routes/services for all 8 Dev A modules (return “not implemented”)

**Do not commit:** `dpdpos-progress-tracker.xlsx`, `scripts/progressive-commits.ps1`, `.env`, or any other local/temp helper scripts. Keep the tracker local for daily status updates only.

**Commit hygiene:** short conventional messages, no trailers, no Co-authored-by lines. One logical slice per commit; open a PR per branch below.

---

## 1. What is left (summary)

| # | Work item | Unblocks | Target window |
|---|---|---|---|
| 1 | Organizations CRUD + system-role seed on create | Everyone’s tenant root | Jul 27–30 |
| 2 | Auth contract wired on protected routes | B/C can protect endpoints | ASAP after orgs |
| 3 | Roles CRUD + permission validation | Users + auth permission resolution | Jul 27–31 |
| 4 | Users invite/list/update | Auth login targets | Jul 27–31 |
| 5 | Departments CRUD | **Dev B inventory FK** | Jul 31 – Aug 4 |
| 6 | Full JWT auth (login/logout/refresh/me) | Real sessions for all | Jul 27 – Aug 3 |
| 7 | Framework generate + roadmap | Governance + B/C reads | Aug 10–19 |
| 8 | Controls CRUD (+ read API) | **B validations, C evidence** | Aug 17–24 |
| 9 | Requirements CRUD | Obligation register | Aug 19–26 |
| 10 | Harden outbox on every mutation + tests | Audit/notifications reliability | continuous |

---

## 2. Merge order (drive these PRs)

1. `feature/shared/contracts-kickoff` *(if not merged yet)*
2. `feature/a/organizations/tenant-crud`
3. `feature/a/auth/contract-and-guard`
4. `feature/a/roles/permission-catalog`
5. `feature/a/users/invite-crud`
6. `feature/a/departments/core-crud` ← **hard unblock for Dev B**
7. `feature/a/auth/jwt-sessions`
8. `feature/a/framework/generate-roadmap`
9. `feature/a/controls/crud`
10. `feature/a/requirements/crud`

---

## 3. Shared rules for every feature commit

1. Tenant-scope every query (`organizationId` from context, never from body).
2. Mutating writes: business rows + `outbox_events` in the **same** Prisma transaction.
3. Zod DTO at the route boundary; reject unknown fields.
4. Wire `authGuard` + `requirePermission(...)` on protected routes (after auth contract PR).
5. Never return `passwordHash` / secrets.
6. Unit tests for service/domain; at least one integration test per module happy path.
7. Update Feature Progress / Merge Checklist in the **local** tracker xlsx (not in git).

---

## 4. Wave 1 — Core platform

### 4.1 Organizations — `feature/a/organizations/tenant-crud`

**Goal:** Replace stubs with real POST/GET/PATCH. On create, seed system roles from `SYSTEM_ROLE_PRESETS`.

**Endpoints:** `POST /organizations`, `GET /organizations/:id`, `PATCH /organizations/:id`  
**Event:** `OrganizationCreated`

#### Progressive commits

| Commit | Message | Files / focus |
|---|---|---|
| A1 | `feat(organizations): implement repository tenant reads and writes` | `organization.repository.ts`, map Prisma ↔ domain |
| A2 | `feat(organizations): create org with system roles and outbox event` | `organization.service.ts`, transaction + role seed + outbox |
| A3 | `feat(organizations): wire DTOs controllers and routes` | dto/validators/controller/routes; remove stub |
| A4 | `test(organizations): add service and HTTP coverage` | `modules/organizations/tests/*` |

**Done when:** create returns org + roles exist; GET is soft-delete aware; outbox row appears; B/C can depend on org id from seed/API.

---

### 4.2 Auth contract — `feature/a/auth/contract-and-guard`

**Goal:** Make guards usable end-to-end *before* full JWT (e.g. test middleware that attaches `RequestContext` from a signed header or temporary bearer decode stub is fine — prefer real JWT verify if login not ready; otherwise attach context in a `devAuthMiddleware` behind `NODE_ENV=development` only for integration tests). Prefer: implement JWT verify reading access token even if login lands in 4.6 — pair with a minimal token issuer helper for tests.

**Deliverables:**

- Access-token verify → populate `req.context`
- `authGuard` + `requirePermission` on all Dev A protected routers
- Short note in README: how B/C declare permissions on routes

#### Progressive commits

| Commit | Message | Files / focus |
|---|---|---|
| B1 | `feat(auth): verify access token and attach RequestContext` | `auth.guard.ts` / auth middleware, JWT helpers |
| B2 | `feat(auth): protect Dev A routes with permission guards` | wire `requirePermission` on org/roles/users/depts routers |
| B3 | `docs(auth): document guard usage for other modules` | README snippet or `docs/auth-guards.md` |
| B4 | `test(auth): cover missing token and missing permission` | guard unit tests |

**Unblocks:** B/C can copy the same guard pattern immediately.

---

### 4.3 Roles — `feature/a/roles/permission-catalog`

**Endpoints:** `GET/POST /roles`, `PATCH /roles/:id/permissions`  
**Events:** `RoleAssigned` (when used from users later), `RolePermissionsChanged`

#### Progressive commits

| Commit | Message | Files / focus |
|---|---|---|
| C1 | `feat(roles): repository list create and permission update` | `role.repository.ts` |
| C2 | `feat(roles): validate permissions against catalog` | service rejects unknown `resource:action` |
| C3 | `feat(roles): expose roles HTTP API with outbox` | controller/routes + `RolePermissionsChanged` |
| C4 | `test(roles): catalog validation and CRUD tests` | tests |

**Done when:** custom roles work; system roles cannot have `isSystemRole` flipped off / deleted; permissions ⊆ `PERMISSIONS`.

---

### 4.4 Users — `feature/a/users/invite-crud`

**Endpoints:** `GET/POST/PATCH /users`  
**Event:** `UserInvited`

#### Progressive commits

| Commit | Message | Files / focus |
|---|---|---|
| D1 | `feat(users): repository with org-scoped email uniqueness` | `user.repository.ts` |
| D2 | `feat(users): invite user and assign default role` | service + `UserRole` + outbox `UserInvited` |
| D3 | `feat(users): list and patch user profile status` | PATCH status/name; never leak hash |
| D4 | `feat(users): wire HTTP routes and response DTOs` | controller/routes |
| D5 | `test(users): invite list and update coverage` | tests |

**Done when:** invite creates `INVITED` user; list is paginated; unique email per org enforced.

---

### 4.5 Departments — `feature/a/departments/core-crud` ⚠️ priority for Dev B

**Endpoints:** `GET/POST /departments`  
**Event:** `DepartmentCreated`

#### Progressive commits

| Commit | Message | Files / focus |
|---|---|---|
| E1 | `feat(departments): repository create and list by org` | repository |
| E2 | `feat(departments): create with optional head user validation` | service checks `headUserId` in same org |
| E3 | `feat(departments): wire HTTP API and outbox` | routes + event |
| E4 | `test(departments): unique name and head-user checks` | tests |

**Done when:** Dev B can migrate `data_assets.department_id` FK against real rows.

---

### 4.6 Full JWT auth — `feature/a/auth/jwt-sessions`

**Endpoints:** `POST /auth/login|logout|refresh`, `GET /auth/me`  
**Table:** `refresh_sessions`  
**Event:** `UserLoggedIn`

#### Progressive commits

| Commit | Message | Files / focus |
|---|---|---|
| F1 | `feat(auth): password verify and issue access refresh pair` | login service, Argon2, JWT sign |
| F2 | `feat(auth): persist and rotate refresh sessions` | `refresh_sessions` + refresh endpoint |
| F3 | `feat(auth): logout revoke and redis deny-list` | logout + Redis jti deny |
| F4 | `feat(auth): implement me endpoint with resolved permissions` | `/me` aggregates roles → permissions |
| F5 | `feat(auth): wire auth routes and outbox UserLoggedIn` | routes + event |
| F6 | `test(auth): login refresh logout and me flows` | integration tests |
| F7 *(optional follow-up)* | `feat(auth): require TOTP MFA for privileged roles` | MFA challenge for ORG_ADMIN/DPO/AUDITOR |

**Done when:** seeded admin can login; refresh rotates; logout kills session; `/me` returns permissions used by guards.

---

## 5. Wave 2 — Governance

### 5.1 Framework — `feature/a/framework/generate-roadmap`

**Endpoints:** `POST /framework/generate`, `GET /framework/roadmap`  
**Event:** `FrameworkPublished` (on publish; generate may stay DRAFT until publish step — prefer generate→DRAFT, optional publish flag or separate publish later; for MVP, generate can create DRAFT + return roadmap, add publish in same PR if small)

**Generate inputs:** industry, maturity, sensitivity, dept count, processors, SDF flag  
**Outputs:** controls + requirements rows + `roadmapJson`

#### Progressive commits

| Commit | Message | Files / focus |
|---|---|---|
| G1 | `feat(framework): add control and requirement template catalog` | `constants/` or `domain/templates.ts` |
| G2 | `feat(framework): generate draft framework from org profile` | service creates framework + child rows |
| G3 | `feat(framework): publish framework and write outbox` | status PUBLISHED + `FrameworkPublished` |
| G4 | `feat(framework): expose generate and roadmap endpoints` | routes/controllers/DTOs |
| G5 | `test(framework): generation produces expected control set` | tests |

**Unblock early:** land **G4 read path** (`GET /roadmap` + list controls via controls module) even if templates are minimal.

---

### 5.2 Controls — `feature/a/controls/crud`

**Endpoints:** `GET/POST/PATCH /controls`  
**Event:** `ControlUpdated`

#### Progressive commits

| Commit | Message | Files / focus |
|---|---|---|
| H1 | `feat(controls): repository list by framework and org` | repository + filters |
| H2 | `feat(controls): create and update control status owners` | service + outbox on update |
| H3 | `feat(controls): wire HTTP API` | routes |
| H4 | `test(controls): crud and tenant isolation` | tests |

**Unblocks:** Dev B validations (read-only), Dev C evidence mapping.

---

### 5.3 Requirements — `feature/a/requirements/crud`

**Endpoints:** `GET/POST /requirements`  
**Event:** `RequirementMapped`

#### Progressive commits

| Commit | Message | Files / focus |
|---|---|---|
| I1 | `feat(requirements): repository list and create` | repository |
| I2 | `feat(requirements): map requirement to control` | optional `controlId` + outbox |
| I3 | `feat(requirements): wire HTTP API` | routes |
| I4 | `test(requirements): create list and mapping` | tests |

---

## 6. Continuous / cross-cutting commits (sprinkle in)

Use these whenever you touch shared infra — still small, focused commits:

| Commit | Message | When |
|---|---|---|
| X1 | `fix(outbox): harden relay idempotency and logging` | after first real producer |
| X2 | `feat(shared): add zod validate middleware helper` | first module that needs it |
| X3 | `test(integration): org-to-department happy path` | after departments |
| X4 | `test(integration): login-to-protected-route path` | after JWT auth |

---

## 7. Suggested calendar (remaining only)

| When | Focus | Branch |
|---|---|---|
| Day 1 | Organizations A1–A4 | `feature/a/organizations/tenant-crud` |
| Day 2 | Auth contract B1–B4 | `feature/a/auth/contract-and-guard` |
| Day 3 | Roles C1–C4 | `feature/a/roles/permission-catalog` |
| Day 4 | Users D1–D5 | `feature/a/users/invite-crud` |
| Day 5 | Departments E1–E4 (**ship to unblock B**) | `feature/a/departments/core-crud` |
| Days 6–8 | JWT auth F1–F6 | `feature/a/auth/jwt-sessions` |
| Aug 10–19 | Framework G1–G5 | `feature/a/framework/generate-roadmap` |
| Aug 17–24 | Controls H1–H4 | `feature/a/controls/crud` |
| Aug 19–26 | Requirements I1–I4 | `feature/a/requirements/crud` |

---

## 8. Example terminal flow (per feature)

```powershell
git checkout develop   # or main, per team convention
git pull
git checkout -b feature/a/organizations/tenant-crud

# ... implement commit A1 ...
git add src/modules/organizations/repositories/
git commit -m "feat(organizations): implement repository tenant reads and writes"

# ... A2, A3, A4 ...
git push -u origin HEAD
# open PR → request review from Dev B + Dev C
```

Never stage:

```text
dpdpos-progress-tracker.xlsx
scripts/progressive-commits.ps1
.env
.env.local
docker/data/
```

---

## 9. Definition of done (remaining stream)

- [ ] All 22 Dev A endpoints return real data (no stub `NotFoundError`)
- [ ] Every mutation writes outbox; relay publishes without errors
- [ ] Guards enforce permissions on all protected Dev A routes
- [ ] Departments merged before Dev B inventory migration
- [ ] Controls `GET` available before Dev B validations
- [ ] Integration tests for: org create → invite user → login → create department
- [ ] Seeded admin login works against full JWT flow
- [ ] Tracker (local only): Feature Progress % and Merge Checklist updated

---

## 10. Hand-off notes for B and C

After each merge, tell them:

| You merged | They can now |
|---|---|
| organizations | Use real `organizationId` |
| auth contract | Copy guard + permission strings |
| departments | Add `department_id` FK / inventory CRUD |
| controls GET | Read controls for validations / evidence tags |
| JWT auth | Call APIs with real Bearer tokens |

---

## 11. Quick reference — your 22 endpoints (still to implement for real)

**Auth:** login, logout, refresh, me  
**Users:** GET/POST/PATCH  
**Roles:** GET/POST, PATCH permissions  
**Organizations:** POST/GET/PATCH  
**Departments:** GET/POST  
**Framework:** generate, roadmap  
**Controls:** GET/POST/PATCH  
**Requirements:** GET/POST
