# Industry-dynamic DPDP questionnaire — research & finalization

Status: **IMPLEMENTED** (core + 6 industry packs; catalog keyed off `Organization.industry`)  
Goal: Make assessment questionnaire **dynamic by organisation industry**, starting with **6 domains**. Core DPDP duties stay shared; each domain adds questions that extract the sector-specific facts needed for readiness scoring and evidence gates.

---

## 1. Problem with the current catalog

Today `QUESTIONNAIRE_CATALOG` is a single horizontal pack (~20 questions): profile → notice/consent → rights → vendors → retention/breach → governance.

That is correct for **Act-level** duties, but it under-extracts **how** those duties apply in context:

| Gap | Why it matters |
|-----|----------------|
| No industry branching | A hospital and an edtech both answer the same “children?” yes/no — we don’t ask about parental consent method, clinical exemptions, or KYC retention vs erasure. |
| Weak data-category capture | We don’t ask what high-risk categories are processed (health, financial, biometric, location, children’s). |
| Sector regulator overlap ignored | BFSI (RBI), telecom (TRAI), healthcare (clinical norms) change retention, localisation, and breach reporting. |
| Org `industry` unused | `Organization.industry` exists in settings/seed but does **not** drive `/questionnaire/catalog`. |

DPDP is **horizontal**; compliance design is **sector-shaped**. Questionnaire should mirror that.

---

## 2. Proposed 6 industries (v1)

Chosen for: Indian digital-economy density, distinct DPDP pressure points, and overlap with existing product language (framework wizard / seed).

| Key | Label | Primary DPDP pressure | Overlapping lens |
|-----|-------|----------------------|------------------|
| `banking_finance` | Banking, NBFC & Fintech | Consent vs KYC/fraud; localisation; dual breach reporting; long retention vs erasure | RBI / payments |
| `healthcare` | Healthcare & Health-tech | Health data safeguards; treatment vs commercial use; access controls; research sharing | Clinical / patient safety norms |
| `ecommerce_retail` | E-commerce & Retail | Marketing/cookie consent; seller/processor DPAs; large-platform retention ceilings | Consumer / marketing |
| `education_edtech` | Education & EdTech | Children’s data (verifiable parental consent); no tracking/targeted ads for minors | Section 9 children rules |
| `it_saas` | IT, SaaS & B2B Tech | Fiduciary vs processor role; sub-processors; cross-border residency; customer DPAs | Contractual / enterprise |
| `telecom` | Telecom & Digital Communications | Volume/SDF likelihood; location & traffic data; third-party / OTT partners; TRAI consent | TRAI / licensing |

**Out of v1 (backlog):** HR/recruitment tech, insurance-only, gaming/social (large-platform schedule), manufacturing IoT.

**Fallback:** Unknown / empty industry → **core pack only** + prompt to set industry in Settings.

---

## 3. Architecture (how it becomes dynamic)

```text
Organization.industry  →  normalizeIndustry(industry)  →  domainKey
catalog(domainKey)     =  CORE_QUESTIONS + INDUSTRY_QUESTIONS[domainKey]
```

### Rules

1. **Core pack** (~16–18 questions): universal DPDP operational questions (refined from today’s catalog). Always required unless `showIf` hides them.
2. **Industry pack** (~8–12 questions): domain-specific; codes prefixed `Q-{DOMAIN}-*` (e.g. `Q-BFSI-LOCALISATION`).
3. **Control engine** keeps mapping via question codes → controls; industry questions mainly enrich **profile**, **severity**, **N/A**, and **document prompts**.
4. Catalog API becomes: `GET /questionnaire/catalog?assessmentId=` or derived from org industry of the assessment’s org (preferred — no client spoofing).
5. Changing industry mid-assessment: allow, but mark prior industry-only answers as **orphaned** (keep history; don’t require them for evaluate).

### Normalisation map (examples)

| Free-text / seed values | domainKey |
|-------------------------|-----------|
| Financial Services, fintech, banking, NBFC, payments | `banking_finance` |
| healthcare, health-tech, hospital, pharma | `healthcare` |
| e-commerce, ecommerce, retail, marketplace | `ecommerce_retail` |
| education, edtech, school, university | `education_edtech` |
| SaaS, IT, software, B2B tech, ITES | `it_saas` |
| telecom, ISP, communications | `telecom` |

---

## 4. Shared CORE questionnaire (all industries)

Stages stay familiar; wording tightened to extract usable facts.

### Stage 1 — Organisation profile
| Code | Question | Options / type | Why we ask |
|------|----------|----------------|------------|
| `Q-BIZ-MODEL` | Who do you primarily process personal data for? | B2C / B2B / BOTH | Notice & rights channel design |
| `Q-DATA-VOLUME` | Approx. scale of digital personal data processed | UNDER_10K / 10K_TO_100K / 100K_TO_1M / OVER_1M | SDF signalling |
| `Q-DATA-CATEGORIES` | Which personal data categories do you process? *(multi later; v1 string CSV or multi-select)* | CONTACT, FINANCIAL, HEALTH, BIOMETRIC, LOCATION, CHILDREN, GOVERNMENT_ID, BEHAVIOURAL, OTHER | Risk / sensitivity |
| `Q-CHILDREN-DATA` | Do you knowingly process personal data of children (<18)? | boolean | Section 9 path |
| `Q-CROSS-BORDER` | Is personal data transferred or accessible outside India? | boolean | Transfer / contracts |
| `Q-FIDUCIARY-ROLE` | For most processing, are you the Data Fiduciary (decide purpose/means) or mainly a Processor? | FIDUCIARY / PROCESSOR / MIXED | Accountability model |

### Stage 2 — Notice & consent
| Code | Question | Type |
|------|----------|------|
| `Q-NOTICE-PUBLISHED` | Do you publish a privacy notice **before** collecting personal data? | boolean |
| `Q-NOTICE-PURPOSE` | Does the notice state purposes in clear, itemised language (not only buried T&Cs)? | boolean |
| `Q-CONSENT-COLLECT` | Where consent is the basis, is it collected before processing starts? | boolean |
| `Q-CONSENT-WITHDRAW` | Can a Data Principal withdraw consent as easily as they gave it? | boolean |
| `Q-CONSENT-MANAGER` | Do you use (or plan to use) a registered Consent Manager? | boolean |

### Stage 3 — Rights
| Code | Question | Type |
|------|----------|------|
| `Q-RIGHTS-ACCESS` | Operational channel for access requests? | boolean |
| `Q-RIGHTS-CORRECT` | Operational channel for correction? | boolean |
| `Q-RIGHTS-DELETE` | Operational channel for erasure (with lawful exceptions)? | boolean |
| `Q-RIGHTS-NOMINATION` | Support for nomination / nominee rights where applicable? | boolean |
| `Q-GRIEVANCE` | Published grievance redressal contact + tracked process? | boolean |
| `Q-GRIEVANCE-SLA` | Do you respond to grievances within **90 days** (Rules timeline)? | boolean |

### Stage 4 — Vendors
| Code | Question | Type | showIf |
|------|----------|------|--------|
| `Q-VENDORS` | Use vendors/processors for personal data? | boolean | |
| `Q-DPA` | Signed DPAs cover those processors? | boolean | Q-VENDORS=true |
| `Q-VENDOR-INVENTORY` | Do you maintain an inventory of processors + purposes? | boolean | Q-VENDORS=true |

### Stage 5 — Retention & breach
| Code | Question | Type |
|------|----------|------|
| `Q-RETENTION` | Retention schedule defined for personal data and relevant logs? | boolean |
| `Q-RETENTION-ERASURE` | Automated or operational erasure when purpose ends / retention expires? | boolean |
| `Q-BREACH-PROCESS` | Documented personal-data breach response process? | boolean |
| `Q-BREACH-NOTIFY` | Process includes notifying the Board and affected principals as required? | boolean |
| `Q-LOG-RETENTION` | Security / processing logs retained at least as required for oversight (Rules: ~1 year where applicable)? | boolean |

### Stage 6 — Governance
| Code | Question | Type | showIf |
|------|----------|------|--------|
| `Q-PRIVACY-OWNER` | Named privacy/compliance owner for DPDP? | boolean | |
| `Q-TRAINING` | Staff who handle personal data receive privacy training? | boolean | |
| `Q-SDF` | Are you (or likely) a Significant Data Fiduciary? | boolean | |
| `Q-DPO` | Appointed Data Protection Officer? | boolean | Q-SDF=true |
| `Q-DPIA` | Conduct data protection impact / risk assessments for high-risk processing? | boolean | Q-SDF=true |
| `Q-AUDIT` | Independent or internal privacy audit in the last 12 months? | boolean | Q-SDF=true |

---

## 5. Industry packs (research-backed)

Each pack: **8–10 questions**, staged under existing stages or a short **“Industry context”** stage (order 1.5) so filers aren’t overwhelmed.

### A. `banking_finance` — Banking, NBFC & Fintech

**Research focus:** RBI KYC/retention vs DPDP erasure; payment data localisation; fraud monitoring vs purpose limitation; CERT-In + Board + often RBI breach paths.

| Code | Stage | Question | Options / type | Extracts |
|------|-------|----------|----------------|----------|
| `Q-BFSI-SEGMENTS` | Industry | Primary segments served? | BANK / NBFC / PAYMENTS / LENDING / INSURTECH / WEALTH / OTHER | Risk profile |
| `Q-BFSI-KYC` | Industry | Do you collect KYC / government ID for onboarding? | boolean | High-sensitivity category |
| `Q-BFSI-LOCALISATION` | Industry | Is payment / customer account data stored and processed in India as required by applicable RBI norms? | boolean / NA | Localisation |
| `Q-BFSI-FRAUD` | Consent/purpose | Is fraud / AML monitoring disclosed as a purpose (or lawful use) in notice? | boolean | Purpose clarity |
| `Q-BFSI-RETENTION-CONFLICT` | Retention | Have you mapped where RBI/SEBI retention mandates **override** or delay DPDP erasure? | boolean | Erasure exceptions |
| `Q-BFSI-BREACH-REG` | Breach | Does breach playbook include sector regulator notification (e.g. RBI) in addition to DPDP Board? | boolean | Dual reporting |
| `Q-BFSI-ACCOUNT-AGG` | Vendors | Do you share data with account aggregators / credit bureaus / payment partners under contracts? | boolean | Processor graph |
| `Q-BFSI-CONSENT-UNBUNDLE` | Consent | Are marketing / cross-sell consents **unbundled** from account opening? | boolean | Consent quality |
| `Q-BFSI-CHILDREN` | Profile | Do any products knowingly onboard minors (e.g. student/minor accounts)? | boolean | Children path |

### B. `healthcare` — Healthcare & Health-tech

**Research focus:** Health data sensitivity; treatment vs research/commercial; access controls; limited children exemptions for treatment contexts under Rules narratives.

| Code | Stage | Question | Type | Extracts |
|------|-------|----------|------|----------|
| `Q-HLTH-SETTING` | Industry | Setting? | HOSPITAL / CLINIC / LAB / HEALTH_APP / TELEMEDICINE / PHARMA / OTHER | Context |
| `Q-HLTH-RECORDS` | Industry | Do you create/store electronic health / clinical records? | boolean | Category |
| `Q-HLTH-CONSENT-TX` | Consent | For clinical treatment, is notice/consent adapted for care delivery (not only app signup)? | boolean | Lawful processing |
| `Q-HLTH-RESEARCH` | Consent | Is patient data used for research, analytics, or commercial secondary use? | boolean | Secondary use |
| `Q-HLTH-RESEARCH-CONSENT` | Consent | If yes — is that secondary use covered by separate informed consent / lawful basis? | boolean | showIf research |
| `Q-HLTH-ACCESS-CTRL` | Governance | Role-based access and audit logs for clinical data? | boolean | Safeguards |
| `Q-HLTH-SHARING` | Vendors | Sharing with labs, insurers, pharmacies, or cloud EHR vendors under DPAs? | boolean | Processors |
| `Q-HLTH-RETENTION` | Retention | Retention aligned to clinical / legal record-keeping requirements and erasure thereafter? | boolean | Retention map |
| `Q-HLTH-CHILDREN` | Profile | Treat/process children’s health data? | boolean | Children + possible treatment nuance |

### C. `ecommerce_retail` — E-commerce & Retail

**Research focus:** Behavioural tracking & marketing consent; marketplace seller processors; large-platform inactivity retention rules; logistics partners.

| Code | Stage | Question | Type | Extracts |
|------|-------|----------|------|----------|
| `Q-ECOM-MODEL` | Industry | Model? | MARKETPLACE / INVENTORY / D2C / OMNI / OTHER | Processor graph |
| `Q-ECOM-TRACKING` | Consent | Cookies / SDKs / behavioural tracking used for ads or personalisation? | boolean | Profiling |
| `Q-ECOM-MARKETING` | Consent | Marketing (SMS/email/push) only with purpose-specific consent / preference centre? | boolean | TRAI-adjacent |
| `Q-ECOM-SELLERS` | Vendors | Marketplace sellers or delivery partners process buyer personal data? | boolean | Sub-processors |
| `Q-ECOM-SELLER-DPA` | Vendors | Contractual privacy terms with those parties? | boolean | showIf sellers |
| `Q-ECOM-PAYMENTS` | Industry | Payment data handled via PCI-aware gateways (not stored unnecessarily)? | boolean | Minimisation |
| `Q-ECOM-RETENTION` | Retention | Inactive account / order data deletion policy defined (and pre-erasure notice if you are a large platform)? | boolean | Schedule 3-style |
| `Q-ECOM-RETURNS` | Rights | Erasure/account deletion workflow handles orders, wallets, and seller copies? | boolean | Rights ops |
| `Q-ECOM-CHILDREN` | Profile | Products/services directed at children or knowingly sell to minors online? | boolean | Children |

### D. `education_edtech` — Education & EdTech

**Research focus:** Section 9 — verifiable parental consent; ban on tracking/targeted ads directed at children; school vs consumer edtech.

| Code | Stage | Question | Type | Extracts |
|------|-------|----------|------|----------|
| `Q-EDU-MODEL` | Industry | Model? | SCHOOL / UNIVERSITY / EDTECH_B2C / EDTECH_B2B / COACHING / OTHER | Context |
| `Q-EDU-UNDER18` | Profile | Majority of end users are under 18? | boolean | Children intensity |
| `Q-EDU-PARENTAL` | Consent | Verifiable **parental/guardian** consent obtained before processing children’s data? | boolean | Section 9 |
| `Q-EDU-VERIFY-METHOD` | Consent | Verification method? | DIGILOCKER / GOV_ID / PARENT_OTP / SCHOOL_ATTEST / OTHER / NONE | Quality of consent |
| `Q-EDU-NO-TRACK` | Consent | Tracking, behavioural monitoring, or targeted advertising **disabled** for child users? | boolean | Hard prohibition |
| `Q-EDU-SCHOOL-SHARE` | Vendors | Student data shared with schools, exam boards, or content partners under agreements? | boolean | Processors |
| `Q-EDU-RETENTION` | Retention | Student data deleted/anonymised after course/cohort purpose ends (+ lawful buffer)? | boolean | Purpose end |
| `Q-EDU-ACCESS` | Rights | Parents/guardians can exercise access/erasure on behalf of the child? | boolean | Rights UX |
| `Q-EDU-BIOMETRIC` | Industry | Biometric / proctoring / facial data used? | boolean | High sensitivity |

### E. `it_saas` — IT, SaaS & B2B Tech

**Research focus:** Fiduciary vs processor; customer instructions; sub-processor lists; cross-border hosting; enterprise DPAs.

| Code | Stage | Question | Type | Extracts |
|------|-------|----------|------|----------|
| `Q-SAAS-ROLE` | Industry | For customer personal data in the product, are you usually Processor or Fiduciary? | PROCESSOR / FIDUCIARY / MIXED | Role |
| `Q-SAAS-DPA-CUSTOMER` | Vendors | Standard customer DPA / data processing terms available? | boolean | Contracts |
| `Q-SAAS-SUBPROCESSORS` | Vendors | Published or disclosed sub-processor list with change notice? | boolean | Transparency |
| `Q-SAAS-RESIDENCY` | Industry | Customer can choose / you document data residency (IN vs multi-region)? | boolean | Cross-border |
| `Q-SAAS-EMPLOYEE` | Industry | Do you process your **own** employees’ / applicants’ data (HR)? | boolean | Second fiduciary role |
| `Q-SAAS-SUPPORT` | Rights | Support tooling can fulfil access/erasure without using production copies indefinitely? | boolean | Rights ops |
| `Q-SAAS-LOGS` | Retention | Product/security logs retention documented and minimised? | boolean | Logs |
| `Q-SAAS-TRAINING-DATA` | Consent | Is customer personal data used to train ML models? | boolean | Secondary use |
| `Q-SAAS-TRAINING-OPT` | Consent | If yes — disclosed and controllable by customer contract/notice? | boolean | showIf |

### F. `telecom` — Telecom & Digital Communications

**Research focus:** High volume / SDF likelihood; CDR/location; TRAI commercial communication consent; partner ecosystems.

| Code | Stage | Question | Type | Extracts |
|------|-------|----------|------|----------|
| `Q-TEL-LICENSE` | Industry | Licensed telecom / ISP / or digital communications platform? | TELCO / ISP / OTT / OTHER | Context |
| `Q-TEL-LOCATION` | Industry | Process precise location or mobility data? | boolean | Sensitivity |
| `Q-TEL-CDR` | Industry | Retain call/session detail records? | boolean | Retention |
| `Q-TEL-LAWFUL` | Governance | Lawful interception / LEA disclosure process separated from commercial use? | boolean | Purpose limit |
| `Q-TEL-TRAI` | Consent | Commercial communication consent aligned with TRAI / preference frameworks? | boolean | Marketing |
| `Q-TEL-PARTNERS` | Vendors | Share subscriber data with content/OTT/partner services under contracts? | boolean | Processors |
| `Q-TEL-BREACH` | Breach | Breach playbook sized for mass-subscriber incidents (comms + Board)? | boolean | Scale |
| `Q-TEL-SDF` | Governance | Given volume/sensitivity, have you assessed SDF likelihood formally? | boolean | SDF |
| `Q-TEL-CHILDREN` | Profile | Any child-oriented plans or knowingly registered minor subscribers? | boolean | Children |

---

## 6. What the form must extract (acceptance checklist)

For every industry pack, answers should let the product decide:

1. **Risk profile** — categories, children, cross-border, volume  
2. **Role** — fiduciary / processor / mixed  
3. **Consent quality** — notice, withdraw, unbundled marketing, parental verification  
4. **Rights operability** — channels + industry-specific proxy (parent, patient)  
5. **Processor graph** — vendors, DPAs, sector partners  
6. **Retention reality** — schedule + sector override / inactivity rules  
7. **Breach readiness** — Board + sector dual-reporting where needed  
8. **Governance** — owner, training, SDF/DPO/DPIA/audit  

Document upload prompts in helpText should name the expected artifact (privacy notice, DPA, retention schedule, breach playbook, parental consent SOP, etc.).

---

## 7. Implementation sketch (after approval)

1. Add `domain/industry-domains.ts` — keys, labels, normaliser.  
2. Split catalog: `questionnaire-core.ts` + `questionnaire-industries/*.ts`.  
3. `getQuestionnaireCatalog(organizationId)` merges core + industry.  
4. Wire FE wizard to org industry; show industry badge on questionnaire stage.  
5. Seed + settings: constrain industry to the 6 keys (allow “Other” → core only).  
6. Update control engine / spine tests for industry-only codes (mostly profile, not new controls in v1).  
7. Docs: update `docs/11_assessment_cli_testing_guide.md`.

**Non-goals for v1:** multi-select UI polish beyond simple options; full Rules schedule automation; legal opinion engine.

---

## 8. Decisions needed from you

Please confirm or edit:

1. **Six domains** as listed — keep, swap (e.g. insurance instead of telecom), or rename?  
2. **Industry stage** as separate “Industry context” vs weave into existing stages?  
3. **`Q-DATA-CATEGORIES`** in core — include in v1 (recommended)?  
4. **Unknown industry** — core-only + settings nudge, OK?  
5. Any must-have questions missing for your pilot customers?

Once approved, implementation can proceed on backend catalog → FE dynamic load → evaluate gating.
