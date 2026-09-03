/** DPDP Act defines children as individuals under 18 years of age (s.2(3)). */
export const DPDP_CHILD_AGE_THRESHOLD = 18;

/** DPDP Rules 2025 — hard regulatory milestones for roadmap due-date caps. */
export const DPDP_REGULATORY_DEADLINES = {
  CONSENT_MANAGER_REGISTRATION: "2026-11-14",
  FULL_COMPLIANCE: "2027-05-14",
} as const;

/** Rights request response SLA mandated by DPDP Rules (days). */
export const DPDP_RIGHTS_RESPONSE_SLA_DAYS = 30;

/** Breach notification window mandated by DPDP Rule 7 (hours). */
export const DPDP_BREACH_NOTIFICATION_HOURS = 72;

/** Automated erasure advance notice period mandated by DPDP Rule 8 (hours). */
export const DPDP_AUTO_DELETE_NOTICE_HOURS = 48;

/**
 * Default denylist used when RESTRICTED_TRANSFER_COUNTRIES env is unset.
 * Prefer reading via env.RESTRICTED_TRANSFER_COUNTRIES at call sites.
 */
export const DEFAULT_RESTRICTED_TRANSFER_COUNTRIES = [
  "CN",
  "RU",
  "KP",
  "IR",
] as const;

