import { NotFoundError } from "../../../shared/errors/app-error.js";
import { withTransaction } from "../../../infrastructure/database/transaction-manager.js";

import type { RequestContext } from "../../../shared/types/request-context.js";

import { validationQueue } from "../../../jobs/queues/validation.queue.js";

import type { ListValidationRunsQuery } from "../dto/validation-run.dto.js";

import { ValidationRunRepository } from "../repositories/validation-run.repository.js";
import { ValidationResultRepository } from "../repositories/validation-result.repository.js";
import {
  toValidationRunResponse,
  type ValidationRunResponse,
} from "../types/validation-run.types.js";
import { toValidationResultResponse } from "../types/validation-result.types.js";

export const VALIDATION_RUN_JOB_NAME = "run-validation";

/**
 * Manual trigger: creates a PENDING run and enqueues its execution on the
 * validation queue. The API process never evaluates inline — the worker owns
 * execution (architecture §8).
 */
export class ValidationRunService {
  constructor(
    private readonly runs = new ValidationRunRepository(),
    private readonly results = new ValidationResultRepository(),
  ) {}

  async trigger(
    ctx: RequestContext,
    input: { triggerType?: "MANUAL" } = {},
  ): Promise<ValidationRunResponse> {
    const run = await withTransaction(async (tx) =>
      this.runs.create(tx, ctx, {
        triggerType: "MANUAL",
      }),
    );

    // jobId = runId dedupes retries at the queue level.
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

    return toValidationRunResponse(run);
  }

  async list(
    ctx: RequestContext,
    options: ListValidationRunsQuery = {},
  ): Promise<ValidationRunResponse[]> {
    const runs = await this.runs.list(ctx.organizationId, {
      status: options.status,
    });

    return runs.map(toValidationRunResponse);
  }

  async getById(
    ctx: RequestContext,
    id: string,
  ): Promise<
    ValidationRunResponse & {
      results: ReturnType<typeof toValidationResultResponse>[];
    }
  > {
    const run = await this.runs.findById(ctx.organizationId, id);

    if (!run) {
      throw new NotFoundError("Validation Run not found");
    }

    const results = await this.results.listByRun(ctx.organizationId, id);

    return {
      ...toValidationRunResponse(run),
      results: results.map(toValidationResultResponse),
    };
  }
}

export const validationRunService = new ValidationRunService();
