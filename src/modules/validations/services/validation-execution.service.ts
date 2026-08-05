import { logger } from "../../../infrastructure/logging/logger.js";
import { withTransaction } from "../../../infrastructure/database/transaction-manager.js";
import { writeOutboxEvent } from "../../../events/outbox/outbox.repository.js";
import { DOMAIN_EVENTS } from "../../../events/types/base-event.interface.js";
import { prisma } from "../../../infrastructure/database/prisma-client.js";

import type { RequestContext } from "../../../shared/types/request-context.js";

import { ValidationRunRepository } from "../repositories/validation-run.repository.js";
import { ValidationRuleRepository } from "../repositories/validation-rule.repository.js";
import { ValidationResultRepository } from "../repositories/validation-result.repository.js";
import { resolveEvaluator, defaultRuleDescriptors } from "../domain/rule.registry.js";
import type {
  RuleEvaluationOutcome,
  ValidationRuleEvaluator,
} from "../domain/rule-evaluator.interface.js";
import type { ValidationRuleRecord } from "../types/validation-rule.types.js";

/** One rule's evaluation result: the outcome plus its source rule row. */
type RuleEvaluation =
  | (RuleEvaluationOutcome & { rule: ValidationRuleRecord })
  | {
      rule: ValidationRuleRecord;
      status: "SKIPPED" | "ERROR";
      explanation: string;
      score?: undefined;
      evidenceRequired?: undefined;
      controlId?: undefined;
    };
import type { ValidationDataProvider } from "../interfaces/validation-data-provider.interface.js";
import { PrismaValidationDataProvider } from "./validation-data.provider.js";
import {
  toValidationRunResponse,
  type ValidationRunResponse,
} from "../types/validation-run.types.js";

/**
 * Sentinel actor for runs triggered outside a user session (scheduled jobs).
 * A valid-UUID sentinel so audit columns stay type-safe and queries can filter
 * system-triggered activity.
 */
export const SYSTEM_ACTOR_ID = "00000000-0000-0000-0000-000000000000";

/** Terminal run states that must not be re-executed (idempotency guard). */
const TERMINAL_RUN_STATUSES = new Set(["COMPLETED", "PARTIAL"]);

/**
 * Executes a validation run to completion:
 *   1. loads + guards the run (skips terminal runs — retry-safe),
 *   2. seeds default rules for the org (idempotent),
 *   3. loads active rules + org discovery snapshot,
 *   4. evaluates every rule (pure; per-rule errors become ERROR results),
 *   5. in ONE transaction: upserts results, writes outbox events, and records
 *      finishedAt + durationMs + final status.
 */
export class ValidationExecutionService {
  constructor(
    private readonly runs = new ValidationRunRepository(),
    private readonly rules = new ValidationRuleRepository(),
    private readonly results = new ValidationResultRepository(),
    private readonly dataProvider: ValidationDataProvider =
      new PrismaValidationDataProvider(),
    private readonly evaluatorResolver: (
      ruleCode: string,
    ) => ValidationRuleEvaluator | null = resolveEvaluator,
  ) {}

  async executeRun(runId: string): Promise<ValidationRunResponse> {
    const run = await this.runs.findByIdForWorker(runId);

    if (!run) {
      throw new Error(`Validation run ${runId} not found`);
    }

    if (TERMINAL_RUN_STATUSES.has(run.status)) {
      logger.debug({ runId, status: run.status }, "validation.run_skipped_terminal");
      return toValidationRunResponse(run);
    }

    const ctx: RequestContext = {
      correlationId: `validation-run:${runId}`,
      organizationId: run.organizationId,
      actorUserId: run.triggeredBy ?? SYSTEM_ACTOR_ID,
      permissions: [],
      roles: [],
    };

    // Mark RUNNING so the run row is observable mid-execution.
    await this.runs.update(prisma, ctx, run.id, { status: "RUNNING" });

    // Single source of truth for timing: the persisted started_at column is
    // set at run creation, so durationMs = finishedAt - started_at (includes
    // any queue wait) — consistent with what the table reports.
    const startedAtMs = run.startedAt.getTime();

    try {
      // Seed defaults idempotently (skipDuplicates) so a fresh org runs the
      // full rule set on its first execution.
      await this.rules.seedDefaults(
        prisma,
        run.organizationId,
        defaultRuleDescriptors().map((d) => ({
          ruleCode: d.code,
          title: d.title,
          description: d.description,
          category: d.category,
          severity: d.severity,
        })),
      );

      const activeRules = await this.rules.list(run.organizationId, {
        activeOnly: true,
      });
      const snapshot = await this.dataProvider.loadSnapshot(run.organizationId);

      // Evaluate all rules (pure — no DB inside evaluators).
      const evaluations = await Promise.all(
        activeRules.map(async (rule): Promise<RuleEvaluation> => {
          const evaluator = this.evaluatorResolver(rule.ruleCode);
          if (!evaluator) {
            return {
              rule,
              status: "SKIPPED",
              explanation: `No registered evaluator for '${rule.ruleCode}'.`,
            };
          }
          try {
            const outcome = await evaluator.evaluate(snapshot);
            return { rule, ...outcome };
          } catch (err) {
            logger.error(
              { err, runId, ruleCode: rule.ruleCode },
              "validation.rule_evaluation_error",
            );
            return {
              rule,
              status: "ERROR",
              explanation:
                err instanceof Error ? err.message : "Rule evaluation failed",
            };
          }
        }),
      );

      const finishedAt = new Date();
      const durationMs = finishedAt.getTime() - startedAtMs;

      const hasErrors = evaluations.some((e) => e.status === "ERROR");
      const finalStatus = hasErrors ? "PARTIAL" : "COMPLETED";

      await withTransaction(async (tx) => {
        for (const evalResult of evaluations) {
          await this.results.upsert(tx, ctx, {
            runId: run.id,
            ruleId: evalResult.rule.id,
            ruleCode: evalResult.rule.ruleCode,
            resultStatus: evalResult.status,
            explanation: evalResult.explanation,
            score: evalResult.score,
            evidenceRequiredFlag: evalResult.evidenceRequired,
            controlId: evalResult.controlId,
          });

          if (evalResult.status === "PASS") {
            await writeOutboxEvent(tx, {
              eventType: DOMAIN_EVENTS.ValidationCompleted,
              organizationId: run.organizationId,
              actorUserId: ctx.actorUserId,
              correlationId: ctx.correlationId,
              payload: {
                runId: run.id,
                ruleCode: evalResult.rule.ruleCode,
                ruleId: evalResult.rule.id,
                score: evalResult.score ?? 100,
              },
            });
          } else if (evalResult.status === "FAIL") {
            await writeOutboxEvent(tx, {
              eventType: DOMAIN_EVENTS.ValidationFailed,
              organizationId: run.organizationId,
              actorUserId: ctx.actorUserId,
              correlationId: ctx.correlationId,
              payload: {
                runId: run.id,
                ruleCode: evalResult.rule.ruleCode,
                ruleId: evalResult.rule.id,
                severity: evalResult.rule.severity,
                evidenceRequiredFlag: evalResult.evidenceRequired ?? false,
                explanation: evalResult.explanation ?? "",
              },
            });
          }
        }

        await this.runs.update(tx, ctx, run.id, {
          status: finalStatus,
          finishedAt,
          durationMs,
        });
      });

      const completed = await this.runs.findById(run.organizationId, run.id);
      logger.info(
        { runId, status: finalStatus, durationMs },
        "validation.run_completed",
      );

      return toValidationRunResponse(completed ?? run);
    } catch (err) {
      // Infrastructure failure — mark FAILED (re-runnable) and rethrow so the
      // queue can retry. Nothing partial persists: results/outbox/status are
      // only written together inside the transaction above.
      await this.runs
        .update(prisma, ctx, run.id, {
          status: "FAILED",
          finishedAt: new Date(),
          durationMs: Date.now() - startedAtMs,
        })
        .catch((updateErr) => {
          logger.error({ err: updateErr, runId }, "validation.run_failed_mark_error");
        });
      throw err;
    }
  }
}

export const validationExecutionService = new ValidationExecutionService();
