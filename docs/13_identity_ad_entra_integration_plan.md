# Identity integration plan — Windows AD, Microsoft Entra ID, Entra + Microsoft 365

**Product:** DPDPOS (backend + CLI)  
**Status:** Plan (not yet implemented)  
**Date:** 2026-08-14  
**Depends on current auth:** org-scoped email/password, JWT access + refresh, in-app TOTP MFA for privileged roles, assessment CLI tokens (`dpdp_…`)

---

## 0. What faculty asked for (and how they differ)

| Ask | What it really means | Typical protocol | Where users live |
|---|---|---|---|
| **Windows AD integration** | On-prem Active Directory (domain controllers) | LDAP/LDAPS bind, and/or ADFS SAML | Corporate domain (`CORP\user`) |
| **Entra (AD) integration** | Microsoft Entra ID (formerly Azure AD) as cloud IdP | OIDC (preferred) or SAML 2.0 | Cloud directory |
| **Entra (AD) integration with 365** | Same Entra tenant that powers Microsoft 365 | OIDC + Microsoft Graph + Conditional Access | M365 users, groups, licenses |

These are **not three unrelated products**. They are three **deployment modes** of the same DPDPOS identity feature:

```text
Mode A — Windows AD (on-prem / hybrid)
  Domain Controller ──LDAPS──► DPDPOS (optional)     OR
  ADFS / Entra Connect ──SAML/OIDC──► DPDPOS

Mode B — Entra ID (cloud-only)
  Entra app registration ──OIDC──► DPDPOS

Mode C — Entra + Microsoft 365 (what Clause-k / PSU bids usually mean)
  Entra tenant (M365) ──OIDC + Conditional Access──► DPDPOS
  Microsoft Graph ──user/group sync──► DPDPOS roles
```

**Recommendation for DPDPOS:** implement **one federation engine** (OIDC first, SAML second) plus **one optional LDAP binder** for pure on-prem AD. Modes B and C share almost all code; Mode A either uses LDAP bind or federates through ADFS/Entra Connect into that same OIDC/SAML engine.

---

## 1. What these integrations help with

### 1.1 For the organisation (GAIL / any PSU or enterprise)

| Benefit | Without directory | With Windows AD / Entra / M365 |
|---|---|---|
| **Single sign-on** | Separate DPDPOS password to remember and reset | Users sign in with the same account as email / laptop / Teams |
| **Joiners / movers / leavers** | Admin must invite and disable users by hand | Disable in AD/Entra → access to DPDPOS stops (via sync or token lifetime) |
| **Role assignment at scale** | Click roles per user in DPDPOS | Map Entra/AD security groups → `ORG_ADMIN`, `DPO`, `AUDITOR`, … |
| **MFA that auditors recognise** | In-app TOTP only (already built) | Entra Conditional Access / Windows Hello / authenticator app enforced by IT |
| **Audit and compliance evidence** | “User X logged into DPDPOS” | Same identity as the corporate directory — easier Board / VAPT / DPB narrative |
| **Least privilege** | Easy to leave orphan accounts | Group membership is the source of truth |
| **Bid / Clause (k) fit** | “Capable of AD / Entra / MFA” is a deployment promise | Product can demonstrate it |

### 1.2 For DPDPOS specifically

- **Privacy Team / DPO / Auditor** stop being a parallel user database.
- **Assessment CLI tokens** stay as they are (machine/evidence tokens); humans who mint them authenticate via AD/Entra in the console.
- **Tenant safety stays DPDPOS-owned:** Entra proves *who* the person is; DPDPOS still issues its own JWT with `organizationId` and permissions. We do **not** put Entra tokens on every API call.

### 1.3 What each mode uniquely adds

| Mode | Unique value |
|---|---|
| **Windows AD** | Works in air-gapped / DC-only networks; no cloud dependency; LDAPS bind for simple password verify against domain |
| **Entra ID** | Modern SSO, MFA policies, app registrations, no need to open LDAP to the app server |
| **Entra + 365** | Reuse the M365 tenant already named in many RFPs; Graph for group membership; Conditional Access; optional future Teams/Outlook notifications using the same tenant |

### 1.4 What these integrations do **not** do

- They do **not** replace DPDP controls, evidence, or the assessment engine.
- They do **not** make the CLI scan Active Directory for personal data (that would be a different product feature).
- They do **not** require the CLI to speak SAML/OIDC for day-to-day `scan` / `submit`.

---

## 2. Current state (baseline)

### Backend today

- Login: `POST /api/v1/auth/login` with `{ organizationId, email, password }`
- Passwords: Argon2; users unique on `(organizationId, email)`
- Access JWT (~15 min) + rotating refresh (~7 days)
- In-app TOTP MFA for `ORG_ADMIN`, `DPO`, `AUDITOR` (login challenge when enrolled)
- RBAC: frozen permission strings; system roles per org
- **No** OIDC, SAML, LDAP, SCIM, Entra app config, or `externalSubject` on `User`

Key paths:

- `src/modules/auth/services/auth.service.ts`
- `src/modules/auth/routes/auth.routes.ts`
- `src/shared/middleware/authenticate.middleware.ts`
- `src/shared/constants/permissions.ts`
- `prisma/schema.prisma` — `User`, `Role`, `UserRole`, `RefreshSession`

### CLI today

- Human mints `dpdp_…` token in UI (`assessment:cli_token`)
- CLI stores token in `~/.dpdp/config.json`
- Scan/submit/status use CLI Bearer — **not** user JWT
- Optional `DPDP_USER_TOKEN` only for `report`

Key paths:

- `E:\projects\dpdpos\dpdp-cli\src\index.ts`
- Backend: `authenticate-cli.middleware.ts`, `assessment.service.ts` → `createCliToken`

**Design rule for this plan:** keep CLI assessment tokens. Add directory SSO for **people**. Optionally add a **device-code / browser login** path later if faculty wants CLI operators to obtain a user JWT without pasting one.

---

## 3. Target architecture

```text
                    ┌─────────────────────────────┐
                    │  Windows AD  /  Entra ID    │
                    │  (+ M365 Conditional Access)│
                    └──────────────┬──────────────┘
                                   │ OIDC / SAML / LDAPS
                                   ▼
┌──────────────────────────────────────────────────────────────┐
│ DPDPOS Auth module                                           │
│  identity.providers (per Organization)                       │
│  identity.group_role_maps                                    │
│  identity.federation service (OIDC + SAML)                   │
│  identity.ldap binder (Windows AD mode)                      │
│  identity.graph sync worker (Entra+365 mode)                 │
│                                                              │
│  After successful IdP proof:                                 │
│    resolve/create User → map groups → roles →                │
│    issue EXISTING DPDPOS access + refresh JWTs               │
└──────────────────────────┬───────────────────────────────────┘
                           │ Bearer DPDPOS JWT (unchanged API)
                           ▼
              Console / API / mint CLI tokens
                           │
                           ▼
                    dpdp-cli (dpdp_ tokens unchanged)
```

**Invariant:** every protected business route continues to use DPDPOS JWT + `organizationId` + permissions. Federation only changes **how** a session is established.

---

## 4. Data model changes (Prisma)

Add fields/tables (illustrative):

### 4.1 `Organization` / settings

```text
OrganizationIdentitySettings
  organizationId
  mode: LOCAL | LDAP_AD | OIDC_ENTRA | SAML_ADFS | HYBRID
  enforceSso: boolean          # block password login when true
  allowLocalBreakGlass: boolean
  disableLocalTotpWhenFederated: boolean
```

### 4.2 Provider config (secrets in vault / encrypted columns)

```text
IdentityProvider
  id, organizationId
  type: LDAP | OIDC | SAML
  name, enabled
  # OIDC
  issuer, clientId, clientSecretEnc, scopes, tenantId
  # SAML
  entityId, acsUrl, idpMetadataUrl, certificate
  # LDAP
  host, port, useTls, bindDnEnc, baseDn, userFilter
  createdAt, updatedAt
```

### 4.3 User external identity

```text
User (extend)
  externalSubject String?     # Entra oid / AD objectGUID
  externalIssuer  String?     # IdP issuer
  upn             String?     # user@gail.co.in
  authSource      LOCAL | LDAP | OIDC | SAML
  passwordHash    String?     # nullable for SSO-only users

  @@unique([organizationId, externalSubject])
  @@unique([organizationId, upn])
```

### 4.4 Group → role mapping

```text
IdentityGroupRoleMap
  organizationId
  providerId
  externalGroupId     # Entra group object id OR AD group DN/SID
  externalGroupName   # display only
  roleId              # DPDPOS Role
  @@unique([organizationId, providerId, externalGroupId, roleId])
```

### 4.5 Sync cursor / audit

```text
IdentitySyncRun
  organizationId, providerId, status, startedAt, finishedAt
  usersCreated, usersUpdated, usersDisabled, errorMessage?

IdentityLinkAudit
  actor, action (LOGIN_SSO | SYNC | ROLE_MAP), payloadHash, …
```

---

## 5. Backend implementation plan (detailed)

### Phase 0 — Foundations (1–1.5 weeks)

**Goal:** make the auth module ready for multiple credential sources without breaking local login.

| Task | Detail |
|---|---|
| 0.1 Schema migration | Add tables/fields above; keep existing seed/demo login working |
| 0.2 `authSource` on session issue | Extend `signAccessToken` optionally with `authSource`, `mfaVerified` from IdP ACR/amr |
| 0.3 Break-glass policy | Always allow ≥1 local `ORG_ADMIN` when `allowLocalBreakGlass` |
| 0.4 Wire `requireMfa` | Apply on sensitive routes (publish framework, close violation, mint CLI token, role permission change, evidence lock) — currently middleware exists but is unused |
| 0.5 Org identity settings API | `GET/PATCH /organizations/:id/identity` (`organization:update`) |
| 0.6 Secrets | Encrypt client secrets / LDAP bind passwords with existing secret-crypto pattern |

**Exit criteria:** local login unchanged; settings APIs + migrations green; MFA middleware actually gates listed routes.

---

### Phase 1 — Microsoft Entra ID via OIDC (Modes B & C core) (2–3 weeks)

**Goal:** “Sign in with Microsoft” for an organisation.

#### 1.1 Entra app registration (ops checklist, documented)

For each customer Entra tenant (or multi-tenant app):

1. Register app “DPDPOS”
2. Redirect URI: `https://<api-host>/api/v1/auth/oidc/callback` (and frontend deep-link if using BFF pattern)
3. Front-channel logout URL (optional)
4. API permissions (application or delegated):
   - Minimum login: `openid`, `profile`, `email`, `User.Read`
   - Group mapping: `GroupMember.Read.All` or groups claim in token (prefer **groups overage** handling via Graph)
5. Optional: expose app roles; we will primarily use **security groups**
6. Store `tenantId`, `clientId`, `clientSecret` (or certificate) in `IdentityProvider`

#### 1.2 New routes

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/v1/auth/oidc/start?organizationId=` | Create state/nonce; redirect to Entra authorize URL |
| `GET` | `/api/v1/auth/oidc/callback` | Validate code → tokens → user → DPDPOS session |
| `POST` | `/api/v1/auth/oidc/logout` | End DPDPOS session; optionally redirect to Entra logout |
| `GET` | `/api/v1/auth/oidc/metadata` | Public discovery helper for admins (no secrets) |

#### 1.3 Federation service (new)

`src/modules/auth/services/oidc.service.ts` (or `identity/` subfolder):

1. Load org’s OIDC provider config
2. Build authorize URL (`state` bound to `organizationId`, PKCE for public clients if frontend-led)
3. Exchange code at token endpoint
4. Validate `id_token` (issuer, audience, nonce, signature via JWKS)
5. Extract `oid` / `sub`, `preferred_username` / UPN, name, email, `amr`/`acr` for MFA
6. `upsertFederatedUser(...)`
7. Resolve groups (from token claim or Graph)
8. Apply `IdentityGroupRoleMap` → replace or merge `UserRole`
9. Issue DPDPOS access + refresh via existing session helpers
10. Set `mfaVerified: true` when Entra Conditional Access satisfied (see §7)

#### 1.4 JIT provisioning rules

| Case | Behaviour |
|---|---|
| First login, email/UPN matches invited user | Link `externalSubject`, activate if `INVITED` |
| First login, no match, JIT enabled | Create `ACTIVE` user with mapped roles (or `MEMBER` default) |
| First login, JIT disabled | Reject with “ask Privacy admin to invite / map group” |
| User `DISABLED` in DPDPOS | Reject even if Entra login succeeds |
| External subject already linked to another user | Reject (conflict) |

#### 1.5 Frontend (out of backend repo, but required)

- Login page: “Sign in with Microsoft” when org identity mode is OIDC
- Handle callback / session storage same as password login
- Hide password form when `enforceSso`

**Exit criteria:** demo org federated to a test Entra tenant; SSO login issues DPDPOS JWT; `/auth/me` shows mapped roles; password login still works for break-glass.

---

### Phase 2 — Entra + Microsoft 365 hardening (Mode C) (1.5–2 weeks)

**Goal:** production-grade M365 tenancy behaviour.

| Task | Detail |
|---|---|
| 2.1 Conditional Access trust | Map Entra MFA claims → `mfaVerified`; skip in-app TOTP enrollment for federated privileged users when org setting says so |
| 2.2 Group sync worker | BullMQ job `identity-sync-queue`: Graph delta query for users/groups; disable users removed from allowed groups |
| 2.3 Group overage | If token has `hasgroups` / overage URL, fetch members via Graph |
| 2.4 Admin consent runbook | Document tenant admin consent for Graph app permissions |
| 2.5 Optional M365 mail | Later: send rights/breach notifications via Graph Mail.Send **using the same tenant** (not required for SSO) |
| 2.6 Domain hint | `login_hint` / `domain_hint=gail.co.in` so users land on the right IdP page |

**Exit criteria:** group membership change in Entra reflects in DPDPOS within sync SLA (e.g. 15 min) or on next login; Conditional Access MFA users never forced through local TOTP.

---

### Phase 3 — Windows AD (Mode A) (2 weeks)

Two sub-options — implement in this order:

#### 3.A Preferred for hybrid enterprises — ADFS / Entra Connect

- On-prem AD synced to Entra (already common with M365) **or** ADFS SAML
- DPDPOS uses **Phase 1 OIDC/SAML** — almost no LDAP in the app
- Faculty “Windows AD integration” is satisfied via **corporate AD identities reaching DPDPOS through federation**

#### 3.B Pure on-prem LDAP bind (when no ADFS/Entra)

| Task | Detail |
|---|---|
| 3.1 LDAP provider config | host, LDAPS port 636, base DN, bind account, user filter `(&(objectClass=user)(sAMAccountName={username}))` |
| 3.2 `POST /auth/ldap/login` | Body: `organizationId`, `username`, `password` → LDAP bind as user → upsert user by UPN/sAMAccountName → issue DPDPOS JWT |
| 3.3 Group membership | LDAP search `memberOf` → map to `IdentityGroupRoleMap` |
| 3.4 Network | App server must reach DCs; document firewall; **never** LDAP without TLS in production |
| 3.5 Lockout / rate limit | Respect AD lockout; add DPDPOS rate limit on LDAP login |

**Do not** store AD passwords. Bind is verify-only.

**Exit criteria:** user authenticates with domain credentials against LDAPS lab; group DN maps to `DPO`; failure modes (bad password, disabled AD account) return safe errors.

---

### Phase 4 — SAML (ADFS / older Entra enterprise apps) (1–1.5 weeks)

| Task | Detail |
|---|---|
| 4.1 ACS endpoint | `POST /api/v1/auth/saml/acs` |
| 4.2 SP metadata | `GET /api/v1/auth/saml/metadata` |
| 4.3 Assertion validate | Signature, audience, NotOnOrAfter, NameID |
| 4.4 Attribute map | NameID / UPN / email / group SIDs → same JIT + role map path as OIDC |

Reuse the same `upsertFederatedUser` + group map service.

---

### Phase 5 — Hardening, tests, ops (1–2 weeks)

| Area | Work |
|---|---|
| Security | PKCE, state/nonce single-use (Redis), clock skew, secret rotation, redirect URI allow-list |
| Tests | Unit: token validation mocks; HTTP: OIDC callback happy/sad; LDAP bind mock; group map; enforceSso blocks password |
| Observability | Audit `UserLoggedIn` with `authSource`; sync run metrics |
| Runbooks | Entra app registration, admin consent, break-glass, disable SSO |
| VAPT notes | Federation endpoints in scope; no client secrets in frontend |

---

## 6. CLI implementation plan

### 6.1 What stays the same (default)

| Command | Auth | Change? |
|---|---|---|
| `dpdp login --token dpdp_…` | Assessment CLI token | **No** |
| `scan` / `submit` / `status` / `evidence` | CLI token | **No** |
| Token mint in UI | User must be logged in (SSO or local) with `assessment:cli_token` | Indirect: humans use Entra to open UI |

Faculty “AD/Entra integration” for compliance scanning is satisfied if **operators authenticate to the console via AD/Entra**, then mint CLI tokens as today.

### 6.2 CLI additions (recommended, phased)

#### Phase C1 — Document + verify (0.5 week)

- README section: “Enterprise SSO does not change CLI tokens”
- `dpdp status` prints token type (`cli` vs `user`) and org/assessment ids
- Backend: CLI token response already org-scoped; add `authSource` of minting user on `CliToken` metadata for audit (`mintedByUserId` already / ensure present)

#### Phase C2 — Optional user login for CLI (device code) (1–1.5 weeks)

For commands that need a **user** JWT (`report`, future admin ops) without pasting tokens:

```text
dpdp auth login --organization <uuid>
  → prints device code + URL
  → user completes Entra login in browser
  → CLI polls POST /api/v1/auth/device/token
  → stores DPDPOS refresh token in OS keychain / ~/.dpdp/user-session.json
dpdp auth logout
dpdp auth whoami
```

Backend:

| Route | Purpose |
|---|---|
| `POST /auth/device/start` | device_code + user_code + verification_uri |
| `POST /auth/device/token` | poll; returns DPDPOS tokens when authorised |
| Device flow backed by Entra device code **or** DPDPOS-hosted usercode that completes OIDC in browser | Prefer DPDPOS-hosted bridge so we still issue our JWT |

#### Phase C3 — LDAP username login in CLI (only if Mode A pure LDAP) (0.5–1 week)

```text
dpdp auth ldap-login --organization <uuid> --username <sam> 
  → prompt password
  → POST /auth/ldap/login
  → store user session
```

Use only for air-gapped AD labs; prefer device code when Entra exists.

#### Phase C4 — Do **not** do (unless explicitly requested)

- Embedding Entra client secrets in the CLI
- Using Entra tokens as API Bearers on business routes
- Scanning Active Directory as a data-inventory source under the guise of “AD integration”

---

## 7. MFA policy matrix

| Org mode | Privileged user MFA | `mfaVerified` on DPDPOS JWT | In-app TOTP |
|---|---|---|---|
| LOCAL | In-app TOTP (current) | Set after `/mfa/verify` | Required for ORG_ADMIN/DPO/AUDITOR |
| OIDC_ENTRA / Entra+365 | Entra Conditional Access | `true` if `amr` contains MFA / ACR meets policy | Optional / disabled by setting |
| LDAP_AD | AD-integrated MFA (NPS/RADIUS) if any; else keep TOTP | LDAP alone ≠ MFA | Keep TOTP unless another factor proven |
| HYBRID | Entra path preferred | Same as Entra | Break-glass local admin keeps TOTP |

Also: **apply `requireMfa`** on mint CLI token and other sensitive routes so a non-MFA session cannot mint powerful assessment credentials.

---

## 8. Group → role mapping (all modes)

Suggested default maps (configurable per org):

| Directory group (example) | DPDPOS role |
|---|---|
| `GAIL-DPDP-Admins` | `ORG_ADMIN` |
| `GAIL-DPDP-Privacy` | `DPO` |
| `GAIL-DPDP-Compliance` | `COMPLIANCE_OFFICER` |
| `GAIL-DPDP-Audit` | `AUDITOR` |
| `GAIL-DPDP-Users` | `MEMBER` |

Rules:

1. On login and on sync: compute desired role set from group maps
2. Never remove `isSystemRole` definitions; only membership
3. Invalidate permission cache (`invalidateUserPermissions`) after map apply
4. Record audit event with group ids used

---

## 9. API surface summary (backend)

| Area | Endpoints |
|---|---|
| Settings | `GET/PATCH /organizations/:id/identity` |
| Providers | `CRUD /organizations/:id/identity/providers` |
| Group maps | `CRUD /organizations/:id/identity/group-maps` |
| OIDC | `GET /auth/oidc/start`, `GET /auth/oidc/callback` |
| SAML | `GET /auth/saml/metadata`, `POST /auth/saml/acs` |
| LDAP | `POST /auth/ldap/login` |
| Device (CLI) | `POST /auth/device/start`, `POST /auth/device/token` |
| Sync | `POST /organizations/:id/identity/sync` (manual), worker schedule |
| Existing | `/auth/login`, `/refresh`, `/logout`, `/me`, MFA routes — retained |

New permissions (add to frozen catalog carefully):

- `identity:read`
- `identity:update`
- `identity:sync`

Grant to `ORG_ADMIN` (and optionally `DPO` read-only).

---

## 10. Folder / module layout (backend)

```text
src/modules/auth/
  identity/
    domain/          # modes, claim parsers, group normalisers
    services/
      oidc.service.ts
      saml.service.ts
      ldap.service.ts
      federated-user.service.ts   # shared JIT + role map
      graph-sync.service.ts
      device-auth.service.ts
    repositories/
    routes/identity.routes.ts
    jobs/identity-sync.processor.ts
    dto/
    tests/
```

Keep password login in existing `auth.service.ts`; call shared `issueSession(user, { mfaVerified, authSource })`.

---

## 11. Suggested delivery order (what to demo to faculty)

1. **Entra OIDC SSO** (largest academic + bid value; covers “Entra” and most of “365”)
2. **Group → role mapping + Graph sync** (makes 365 real)
3. **Conditional Access MFA trust** + wire `requireMfa` on sensitive routes
4. **CLI docs + optional device-code user login**
5. **Windows AD** via Entra Connect/ADFS if hybrid, else LDAPS bind
6. **SAML** if a specific ADFS-only environment is required

---

## 12. Effort estimate (engineering)

| Workstream | Estimate |
|---|---|
| Phase 0 foundations | 1–1.5 weeks |
| Phase 1 Entra OIDC | 2–3 weeks |
| Phase 2 Entra+365 sync/MFA | 1.5–2 weeks |
| Phase 3 Windows AD (LDAP or hybrid doc+SAML) | 1–2 weeks |
| Phase 4 SAML polish | 1–1.5 weeks |
| Phase 5 hardening/tests | 1–2 weeks |
| CLI C1–C2 | 1.5–2 weeks |
| **Total calendar (one engineer)** | **~10–14 weeks** |
| **MVP faculty demo (OIDC + group map + CLI unchanged)** | **~4–5 weeks** |

---

## 13. Acceptance criteria (MVP)

- [ ] Org can enable Entra OIDC and users sign in without a DPDPOS password
- [ ] Entra group membership maps to DPDPOS roles on login
- [ ] Federated privileged users satisfy MFA via Conditional Access (`mfaVerified`)
- [ ] Break-glass local admin still works
- [ ] Password login can be disabled per org (`enforceSso`)
- [ ] Existing `dpdp_…` CLI flow works after SSO users mint tokens in the UI
- [ ] Audit log shows `authSource=OIDC` (or LDAP/SAML)
- [ ] No Entra access token is accepted as API auth on business routes

---

## 14. Risks and decisions for you / faculty

1. **Multi-tenant Entra app vs per-customer app registration** — per-customer is safer for PSU isolation.
2. **JIT vs invite-only** — invite-only is safer for GAIL-like orgs; JIT is easier for demos.
3. **Replace local TOTP or keep both** — recommend: Entra MFA primary; local TOTP for break-glass and LOCAL mode.
4. **Whether CLI device-code is in scope for the faculty demo** — optional; explain that CLI uses evidence tokens by design.
5. **LDAP in production** — only with LDAPS and network controls; prefer federation.

---

## 15. One-paragraph answer you can give faculty

> DPDPOS will integrate with Windows AD and Microsoft Entra ID so employees sign in with their corporate account instead of a separate password. Entra integration with Microsoft 365 means we use the same tenant as Office 365: SSO, Conditional Access MFA, and security groups mapped to DPDPOS roles (DPO, Auditor, etc.). The backend will federate via OIDC (and LDAP/SAML where needed), then issue our existing JWTs so tenant isolation and permissions stay unchanged. The CLI keeps its assessment tokens for scanning; operators authenticate to the console through AD/Entra to mint those tokens. This improves joiners/leavers handling, auditability, MFA, and bid compliance — it does not replace the DPDP control engine.

---

*End of plan. Next step when approved: Phase 0 schema + identity settings API, then Entra OIDC spike against a test tenant.*
