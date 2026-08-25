# Why Vendors / TPRM / SCRM exist in DPDPOS

## The problem

Under DPDP, a Data Fiduciary stays accountable when personal data is shared with **processors** (payroll, cloud, KYC, loan partners, CRMs, WhatsApp Business APIs, etc.).
Questionnaire checkboxes alone do not prove:

- which processors actually handle PII,
- whether a **DPA** is in force,
- whether diligence is current,
- or how data hops to **nth parties** (sub-processors).

7UNIT’s Trace model stressed the same gap: *map where PII travels*, then keep **operational evidence** (not a one-time policy upload).

## What this feature is for

| Layer | Job |
|-------|-----|
| **TPRM (Vendors)** | Registry of direct processors: risk, DPA lifecycle, diligence reviews |
| **SCRM** | Supply-chain edges (sub-processors), risk roll-up, change acknowledgement |
| **Inventory link** | `ProcessingActivity.vendorId` — “this purpose shares data with X” |
| **Trace ops** | Subject locator + multi-system erasure checklist including vendors |
| **CLI `vendors scan`** | Discover processor SDKs / DPA language in *repos* without tying to assessment evaluate |

Assessment controls (`DPDP-VENDOR-*`) and validation rules (`vendor-dpa-present`) then fail honestly when the registry has ACTIVE vendors without DPAs — evidence for remediation and counsel review, **not** a certification.

## How it works (system flow)

```text
Discover processors (manual UI and/or CLI scan)
        ↓
Register Vendor rows (TPRM registry)
        ↓
Attach ACTIVE DPA + diligence outcome (APPROVED / CONDITIONAL / …)
        ↓
Link sub-processors (SCRM graph) and acknowledge material changes
        ↓
Point Processing Activities at the vendor
        ↓
Validations + vendor-risk analytics + erasure / subject locator use the same registry
```

1. **Registry** — Every processor is a `Vendor` with type, criticality, countries, and data categories.
2. **Contracts** — `VendorAgreement` versions track DPA status and expiry (`vendor-dpa-present`).
3. **Diligence** — `VendorDiligenceReview` outcomes (`APPROVED`, `CONDITIONAL`, `REJECTED`, `PENDING`) drive `vendor-review-current` and residual risk.
4. **Supply chain** — `VendorRelationship` edges (usually `SUB_PROCESSOR`) roll child criticality into the parent risk scorecard; unacknowledged edges stay visible until an owner acks.
5. **Ops** — Rights erasure checklists and subject locator can include vendors; dashboard **vendor-risk** summarises gaps (missing DPA, expiring DPA, high residual).

## How a real organisation should use it

### Week 0 — Bootstrap inventory

1. List known processors (legal + IT + product): cloud, KYC, payroll, CRM, messaging, analytics, payment gateways.
2. In **Vendors**, create each as ACTIVE (or DRAFT until counsel confirms). Use criticality honestly (KYC/biometric → CRITICAL/HIGH).
3. Optional: run `dpdp vendors scan <repo>` on engineering codebases, then `vendors sync` with a **user JWT** (not an assessment `dpdp_…` token) to create DRAFT vendors from findings. Review and promote to ACTIVE in the UI.

### Week 1 — Contracts and diligence

1. For each ACTIVE vendor, attach an **ACTIVE DPA** (title, version, expiry, sub-processor / cross-border flags).
2. Record a diligence review with a real outcome:
   - **APPROVED** — proceed; schedule next review.
   - **CONDITIONAL** — proceed with compensating controls / residual risk noted.
   - **REJECTED** — do not share new PII; plan offboard or replace.
   - **PENDING** — incomplete; validations should still fail until completed.
3. Clear `vendor-dpa-present` / `vendor-review-current` failures before treating an assessment as “green.”

### Ongoing — Supply chain (SCRM)

1. When a processor discloses a new sub-processor, **create that party as its own Vendor**, then **Link sub-processor** on the parent.
2. **Acknowledge** material chain changes so risk ownership is explicit.
3. Re-check parent residual risk and any processing activities that flow through the parent.

### Ongoing — Inventory and Trace

1. On each Processing Activity that shares data externally, set `vendorId`.
2. For erasure / access requests, use subject locator and vendor checklist items so counsel can show *where* data was and *what* was deleted.

### Roles

| Role | Typical actions |
|------|-----------------|
| ORG_ADMIN / COMPLIANCE_OFFICER | Create vendors, DPAs, reviews, relationships, offboard |
| AUDITOR | Read registry and risk (no mutate) |
| Engineering | CLI scan → sync DRAFTs; does not replace legal DPA sign-off |

## What it is not

- Not a credit-rating / dark-web monitor
- Not “we certify you compliant”
- Assessment `dpdp scan/submit` remains separate; use `dpdp vendors scan` for third-party discovery

## Demo seed (local)

After `npm run prisma:seed` (or re-seed vendor upserts), the demo org includes:

| Vendor | Role |
|--------|------|
| Demo Loan Processor | Direct processor **without** DPA (shows gaps) |
| Acme KYC Cloud | Sub-processor under the loan processor |
| NotifyStack SMS | Sub-processor under the loan processor |
| Horizon Object Storage | Direct processor **with** ACTIVE DPA + APPROVED review |
