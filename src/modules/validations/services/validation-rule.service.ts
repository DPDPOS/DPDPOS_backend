import { ConflictError, NotFoundError, ValidationError } from "../../../shared/errors/app-error.js";
import { withTransaction } from "../../../infrastructure/database/transaction-manager.js";

import type { RequestContext } from "../../../shared/types/request-context.js";

import { ValidationRuleRepository } from "../repositories/validation-rule.repository.js";
import { resolveEvaluator } from "../domain/rule.registry.js";
import type {
  CreateValidationRuleDto,
  ListValidationRulesQuery,
  UpdateValidationRuleDto,
} from "../dto/validation-rule.dto.js";
import {
  toValidationRuleResponse,
  type ValidationRuleResponse,
} from "../types/validation-rule.types.js";

export class ValidationRuleService {
  constructor(
    private readonly repository = new ValidationRuleRepository(),
  ) {}

  async list(
    ctx: RequestContext,
    options: Partial<ListValidationRulesQuery> = {},
  ): Promise<ValidationRuleResponse[]> {
    const rules = await this.repository.list(ctx.organizationId, {
      category: options.category,
      activeOnly: options.activeOnly,
    });

    return rules.map(toValidationRuleResponse);
  }

  async getById(
    ctx: RequestContext,
    id: string,
  ): Promise<ValidationRuleResponse> {
    const rule = await this.repository.findById(ctx.organizationId, id);

    if (!rule) {
      throw new NotFoundError("Validation Rule not found");
    }

    return toValidationRuleResponse(rule);
  }

  /**
   * Creates a rule row bound to a registered evaluator. A rule code without a
   * typed evaluator can never execute — reject it up front.
   */
  async create(
    ctx: RequestContext,
    input: CreateValidationRuleDto,
  ): Promise<ValidationRuleResponse> {
    const evaluator = resolveEvaluator(input.ruleCode);
    if (!evaluator) {
      throw new ValidationError(
        `No registered evaluator exists for rule code '${input.ruleCode}'`,
      );
    }

    const existing = await this.repository.findByCode(
      ctx.organizationId,
      input.ruleCode,
    );
    if (existing) {
      throw new ConflictError(
        `Rule '${input.ruleCode}' already exists for this organization`,
      );
    }

    return withTransaction(async (tx) => {
      const rule = await this.repository.create(tx, ctx, {
        ruleCode: input.ruleCode,
        title: input.title ?? evaluator.descriptor.title,
        description:
          input.description ?? evaluator.descriptor.description,
        legalBasisRef: input.legalBasisRef,
        severity: (input.severity ?? evaluator.descriptor.severity) as never,
        category: (input.category ?? evaluator.descriptor.category) as never,
      });

      return toValidationRuleResponse(rule);
    });
  }

  async update(
    ctx: RequestContext,
    id: string,
    input: UpdateValidationRuleDto,
  ): Promise<ValidationRuleResponse> {
    const existing = await this.repository.findById(ctx.organizationId, id);

    if (!existing) {
      throw new NotFoundError("Validation Rule not found");
    }

    return withTransaction(async (tx) => {
      const rule = await this.repository.update(tx, ctx, id, input.version, {
        title: input.title,
        description:
          input.description !== undefined ? input.description : undefined,
        legalBasisRef:
          input.legalBasisRef !== undefined
            ? input.legalBasisRef
            : undefined,        severity: input.severity,
        activeFlag: input.activeFlag,
      });

      if (!rule) {
        throw new ConflictError(
          "Concurrent update detected; refresh and retry with the current version",
        );
      }

      return toValidationRuleResponse(rule);
    });
  }
}

export const validationRuleService = new ValidationRuleService();
