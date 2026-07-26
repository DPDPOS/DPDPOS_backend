# DPDPOS Documentation Pack

**Project:** DPDPOS — Digital Personal Data Protection Operating System  
**Prepared for:** Capstone project on DPDP framework building and validation  
**Document date:** 2026-07-24  
**Version:** 1.0

## Legal basis used for these documents

This product documentation is grounded in the official DPDP Act, 2023, the DPDP Rules, 2025, and the 2025 notification establishing the Data Protection Board of India. The Act governs digital personal data processing, the Rules provide operational detail and staged commencement, and the Board notification establishes the enforcement body.  

The product documents below are intentionally structured around:
- Data Fiduciary / Data Principal terminology,
- consent and notice workflows,
- rights handling,
- security safeguards,
- breach handling,
- significant data fiduciary controls,
- consent manager records,
- audit / evidence / enforcement workflows,
- and staged implementation aligned to the Rules’ commencement schedule.

> Note: This pack is a product and implementation document for a capstone web app. It is not legal advice.
# Database Plan

## 1. Database objective

The database must store the entire compliance operating model in a way that is:
- tenant-safe,
- auditable,
- searchable,
- exportable,
- and suitable for workflow histories.

## 2. Database design principles

### 2.1 Tenant isolation
Every business table must carry an organization identifier.

### 2.2 Traceability
Important objects need:
- created_by,
- updated_by,
- created_at,
- updated_at,
- status,
- history records.

### 2.3 Evidence linking
Every important claim should be linkable to evidence objects.

### 2.4 History preservation
The system should retain:
- consent history,
- validation history,
- violation history,
- request history,
- audit logs.

### 2.5 Soft deletion where needed
Some operational records should be soft-deleted to preserve auditability.

## 3. Core tables

### 3.1 organizations
Stores tenant records.

Important fields:
- id,
- name,
- industry,
- company_size,
- maturity_level,
- status,
- created_at,
- updated_at.

### 3.2 users
Stores user identities.

Important fields:
- id,
- organization_id,
- name,
- email,
- password_hash,
- status,
- last_login_at.

### 3.3 roles
Stores role definitions.

Important fields:
- id,
- organization_id,
- name,
- permissions_json,
- is_system_role.

### 3.4 departments
Stores internal departments or business units.

Important fields:
- id,
- organization_id,
- name,
- head_user_id.

### 3.5 data_assets
Stores personal-data assets.

Important fields:
- id,
- organization_id,
- department_id,
- asset_name,
- asset_type,
- category,
- sensitivity,
- owner_user_id,
- storage_location,
- retention_period,
- status.

### 3.6 processing_activities
Stores how an asset is processed.

Important fields:
- id,
- organization_id,
- data_asset_id,
- purpose,
- source_system,
- recipient_type,
- processor_name,
- legal_basis,
- retention_rule,
- notes.

### 3.7 notices
Stores notice versions and delivery records.

Important fields:
- id,
- organization_id,
- title,
- version,
- content,
- effective_from,
- published_by.

### 3.8 consent_records
Stores consent events.

Important fields:
- id,
- organization_id,
- data_subject_identifier,
- notice_id,
- purpose,
- consent_state,
- granted_at,
- withdrawn_at,
- proof_file_id.

### 3.9 data_subject_requests
Stores rights requests and grievances.

Important fields:
- id,
- organization_id,
- request_type,
- requester_reference,
- status,
- assigned_to,
- opened_at,
- due_at,
- closed_at,
- resolution_summary.

### 3.10 validation_rules
Stores compliance rules.

Important fields:
- id,
- organization_id,
- rule_code,
- title,
- description,
- legal_basis_ref,
- severity,
- active_flag.

### 3.11 validation_runs
Stores each execution of a rule or batch of rules.

Important fields:
- id,
- organization_id,
- triggered_by,
- trigger_type,
- started_at,
- ended_at,
- run_status.

### 3.12 validation_results
Stores the result of each rule execution.

Important fields:
- id,
- organization_id,
- validation_run_id,
- validation_rule_id,
- result_status,
- explanation,
- score,
- evidence_required_flag.

### 3.13 violations
Stores incidents and compliance failures.

Important fields:
- id,
- organization_id,
- validation_result_id,
- severity,
- title,
- description,
- status,
- opened_at,
- due_at,
- closed_at.

### 3.14 remediation_tasks
Stores actions needed to fix violations.

Important fields:
- id,
- organization_id,
- violation_id,
- owner_user_id,
- task_title,
- task_description,
- status,
- due_at,
- closed_at.

### 3.15 evidence_files
Stores file metadata, not necessarily the raw file itself.

Important fields:
- id,
- organization_id,
- file_name,
- storage_key,
- mime_type,
- file_hash,
- uploaded_by,
- uploaded_at,
- access_scope.

### 3.16 audit_logs
Stores immutable platform actions.

Important fields:
- id,
- organization_id,
- actor_user_id,
- action_type,
- entity_type,
- entity_id,
- before_json,
- after_json,
- created_at.

### 3.17 reports
Stores generated reports.

Important fields:
- id,
- organization_id,
- report_type,
- status,
- generated_by,
- generated_at,
- file_id.

### 3.18 notifications
Stores alerts and reminders.

Important fields:
- id,
- organization_id,
- recipient_user_id,
- notification_type,
- channel,
- status,
- sent_at,
- read_at.

## 4. Relationship model

### One-to-many
- one organization -> many users
- one organization -> many departments
- one organization -> many data assets
- one data asset -> many processing activities
- one validation run -> many validation results
- one violation -> many remediation tasks
- one report -> many linked evidence items

### Many-to-many
- roles and permissions
- controls and evidence files
- data assets and tags
- reports and source entities

## 5. Indexing plan

Add indexes to:
- organization_id,
- status fields,
- due_at,
- created_at,
- rule_code,
- request_type,
- asset_type,
- validation_run_id.

## 6. Retention strategy

The database should support retention for:
- audit logs,
- evidence metadata,
- request history,
- validation history,
- violation history,
- notifications.

Retention policies should be configurable at the tenant level, while still respecting the product’s legal and security requirements.

## 7. Seed data strategy

Seed:
- sample organization,
- sample departments,
- sample roles,
- sample framework controls,
- sample validation rules,
- sample violations,
- sample evidence items,
- sample reports.

## 8. Migration strategy

- schema-first migration workflow,
- versioned migrations,
- no destructive production migration without review,
- seed separate from migration.

## 9. Data quality controls

- unique constraints where appropriate,
- foreign key integrity,
- validation at insert/update,
- history preservation,
- audit logging for sensitive changes.

## 10. Database deliverables
- schema document,
- migration scripts,
- seed data,
- ER diagram,
- index plan,
- retention policy document.
