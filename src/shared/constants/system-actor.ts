/**
 * Sentinel actor for system-triggered activity (scheduled jobs, event
 * handlers). A valid-UUID sentinel so audit columns stay type-safe and
 * queries can filter system-triggered rows.
 */
export const SYSTEM_ACTOR_ID = "00000000-0000-0000-0000-000000000000";
