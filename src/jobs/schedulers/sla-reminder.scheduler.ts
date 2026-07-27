import { logger } from "../../infrastructure/logging/logger.js";

export function registerSlaReminderScheduler(): void {
  logger.debug("scheduler.sla_reminder.deferred");
}
