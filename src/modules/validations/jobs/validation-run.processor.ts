import { logger } from "../../../infrastructure/logging/logger.js";
import { withTransaction } from "../../../infrastructure/database/transaction-manager.js";

import type { RequestContext } from "../../../shared/types/request-context.js";

import { validationQueue } from "../../../jobs/queues/validation.queue.js";

import { validationExecutionService, SYSTEM_ACTOR_ID } from "../services/validation-execution.service.js";
import { VALIDATION_RUN_JOB_NAME } from "../services/validation-run.service.js";
import { ValidationRunRepository } from "../repositories/validation-run.repository.js";
import { ValidationRuleRepository } from "../repositories/validation-rule.repository.js";

export type ValidationRunJobData = {
  runId: string;
};

// Single source of truth for the sweep job name lives here; the per-run job
// name is owned by the run service and re-exported for the worker + scheduler.
export { VALIDATION_RUN_JOB_NAME };
export const DAILY_VALIDATION_SWEEP_JOB_NAME = "daily-validation-sweep";

/**
 * Processes a "run-validation" job: executes the referenced validation run.
 * Idempotent — the execution engine skips terminal runs, and result rows are
 * upserted by (runId, ruleId), so retries under at-least-once delivery are safe.
 */
export async function processValidationRunJob(
  jobData: ValidationRunJobData,
): Promise<{ runId: string; status: string }> {
  const { runId } = jobData;

  if (!runId) {
    throw new Error("Validation run job missing runId");
  }

  const run = await validationExecutionService.executeRun(runId);

  logger.info({ runId, status: run.status }, "validation.job_completed");

  return { runId, status: run.status };
}

/**
 * Scheduled sweep: for every organization with at least one active rule,
 * create a SCHEDULED run and enqueue its execution. Idempotent by design —
 * each run is enqueued once with jobId = runId; running the sweep twice on
 * the same day produces two distinct runs (auditable history), never a
 * duplicate of the same run.
 */
export async function processDailyValidationSweep(): Promise<{
  runsCreated: number;
}> {
  const runs = new ValidationRunRepository();
  const rules = new ValidationRuleRepository();

  const orgIds = await rules.listActiveRuleOrganizationIds();
  let runsCreated = 0;

  for (const organizationId of orgIds) {
    const ctx: RequestContext = {
      correlationId: `validation-sweep:${organizationId}`,
      organizationId,
      actorUserId: SYSTEM_ACTOR_ID,
      permissions: [],
      roles: [],
    };

    const run = await withTransaction(async (tx) =>
      runs.create(tx, ctx, { triggerType: "SCHEDULED" }),
    );

    await validationQueue.add(
      VALIDATION_RUN_JOB_NAME,
      { runId: run.id },
      {
        jobId: run.id,
        attempts: 3,
        backoff: { type: "exponential", delay: 2000 },
        removeOnComplete: 500,
        removeOnFail: 1000,
      },
    );

    runsCreated += 1;
  }

  logger.info(
    { organizations: orgIds.length, runsCreated },
    "validation.sweep_completed",
  );

  return { runsCreated };
}
