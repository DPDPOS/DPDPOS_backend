# Vendor TPRM / SCRM + Trace alignment

Status: **IMPLEMENTED** (core TPRM/SCRM + Trace + CLI); DPA expiry / SCRM ack risk / offboard cleanup included in domain logic  
Goal: First-class third-party risk (TPRM) and supply-chain risk (SCRM), framed by the 7UNIT model: **engineering audit first**, then **Trace-like operational evidence**.

---

## 1. Product model (7UNIT-aligned)

```text
Engineering audit (discovery)  →  Trace-like continuous OS  →  Evidence for legal review
```

| Layer | Purpose | DPDPOS owner |
|-------|---------|--------------|
| Engineering audit | Public surface + internal system map; auditor’s eyes | Assessment checklist stage + inventory + CLI |
| Trace ops | Consent timestamps, subject locator, multi-system erasure proof | Consent, rights, vendors, evidence |
| TPRM | Direct processors: registry, DPA, diligence, residual risk | `vendors` module |
| SCRM | Nth-party graph, roll-up risk, change notice | `VendorRelationship` + risk calculator |
| Legal-ready pack | Exportable evidence, not a certification | Assessment report + erasure evidence pack |

---

## 2. Trace claims vs DPDPOS (gap map)

| Claim | Before this workstream | Target |
|-------|------------------------|--------|
| Engineering audit journey | Questionnaire only | `engineering_audit` questionnaire stage |
| System / processor inventory | Free-text `processorName` | `Vendor` master + FK on activities |
| DPA lifecycle | Upload `VENDOR_DPA` doc | `VendorAgreement` versions + expiry |
| Sub-processor / supply chain | SaaS Q only | Relationship graph + roll-up |
| Subject “where is my data?” | Fragmented | `GET /subject-locator` |
| Erasure across systems + proof | DSR status only | Cooling-off + checklist + evidence pack |
| Auditor / counsel report | Readiness score | Vendor risk + erasure pack sections |

---

## 3. API surface (summary)

| Area | Base path |
|------|-----------|
| Vendors CRUD / risk | `/api/v1/vendors` |
| Diligence reviews | `/api/v1/vendors/:id/reviews` |
| Agreements (DPA) | `/api/v1/vendors/:id/agreements` |
| Supply-chain edges | `/api/v1/vendors/:id/relationships` |
| Subject locator | `/api/v1/subject-locator` |
| Erasure evidence | `/api/v1/data-subject-requests/:id/erasure-*` |
| Analytics | `/api/v1/analytics/vendor-risk` |

Permissions: `vendor:read|create|update|review|offboard`.

---

## 4. Assessment / validation hooks

- Controls `DPDP-VENDOR-INVENTORY` / `DPDP-VENDOR-DPA` evaluate live vendor + agreement state when present.
- Validation rules: `vendor-dpa-present`, `vendor-review-current`.
- New questionnaire stage: `engineering_audit` (public surface, hosting region, informal channels, DPO).

---

## 5. Non-goals (v1)

External credit ratings, dark-web monitoring, automated CRM erase connectors (API stubs / webhooks only), certification claims.
