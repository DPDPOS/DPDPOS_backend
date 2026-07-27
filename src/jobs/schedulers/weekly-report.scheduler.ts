import { logger } from "../../infrastructure/logging/logger.js";

export function registerWeeklyReportScheduler(): void {
  logger.debug("scheduler.weekly_report.deferred");
}
