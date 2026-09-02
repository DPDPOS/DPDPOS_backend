import type {
  Prisma,
  ValidationRule as PrismaValidationRule,
  RuleCategory,
  RuleSeverity,
} from "@prisma/client";

import { prisma } from "../../../infrastructure/database/prisma-client.js";
import { BaseRepository } from "../../../shared/repository/base.repository.js";
import type { RequestContext } from "../../../shared/types/request-context.js";

import type { ValidationRuleRecord } from "../types/validation-rule.types.js";

type DbClient = Prisma.TransactionClient | typeof prisma;

export type CreateValidationRuleData = {
  ruleCode: string;
  title: string;
  description?: string;
  legalBasisRef?: string;
  severity: RuleSeverity;
  category: RuleCategory;
  activeFlag?: boolean;
};

export type SeedValidationRuleData = {
  ruleCode: string;
  title: string;
  description: string;
  category: string;
  severity: string;
};

export type UpdateValidationRuleData = {
  title?: string;
  description?: string | null;
  legalBasisRef?: string | null;
  severity?: RuleSeverity;
  activeFlag?: boolean;
};

export type ListValidationRulesOptions = {
  category?: RuleCategory;
  activeOnly?: boolean;
  includeDeleted?: boolean;
};

function mapRule(row: PrismaValidationRule): ValidationRuleRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,

    ruleCode: row.ruleCode,
    title: row.title,
    description: row.description,
    legalBasisRef: row.legalBasisRef,
    severity: row.severity,
    category: row.category,
    activeFlag: row.activeFlag,
    version: row.version,

    createdBy: row.createdBy,
    updatedBy: row.updatedBy,

    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
}

export class ValidationRuleRepository extends BaseRepository {
  async findById(
    organizationId: string,
    id: string,
    options: { includeDeleted?: boolean } = {},
  ): Promise<ValidationRuleRecord | null> {
    const row = await prisma.validationRule.findFirst({
      where: {
        id,
        ...this.tenantWhere({
          organizationId,
          includeDeleted: options.includeDeleted,
        }),
      },
    });

    return row ? mapRule(row) : null;
  }

  async findByCode(
    organizationId: string,
    ruleCode: string,
  ): Promise<ValidationRuleRecord | null> {
    const row = await prisma.validationRule.findFirst({
      where: {
        ruleCode,
        ...this.tenantWhere({ organizationId }),
      },
    });

    return row ? mapRule(row) : null;
  }

  async list(
    organizationId: string,
    options: ListValidationRulesOptions = {},
  ): Promise<ValidationRuleRecord[]> {
    const rows = await prisma.validationRule.findMany({
      where: {
        ...this.tenantWhere({
          organizationId,
          includeDeleted: options.includeDeleted,
        }),
        ...(options.category ? { category: options.category } : {}),
        ...(options.activeOnly ? { activeFlag: true } : {}),
      },
      orderBy: {
        ruleCode: "asc",
      },
    });

    return rows.map(mapRule);
  }

  /** Distinct organization ids that have at least one active rule — used by the daily sweep. */
  async listActiveRuleOrganizationIds(): Promise<string[]> {
    const rows = await prisma.validationRule.findMany({
      where: {
        activeFlag: true,
        deletedAt: null,
      },
      distinct: ["organizationId"],
      select: { organizationId: true },
    });

    return rows.map((r) => r.organizationId);
  }

  /**
   * Seeds the default rule set for an org — idempotent: rows already present
   * (per [organizationId, ruleCode] unique) are skipped.
   */
  async seedDefaults(
    db: DbClient,
    organizationId: string,
    defaults: SeedValidationRuleData[],
  ): Promise<void> {
    await db.validationRule.createMany({
      data: defaults.map((d) => ({
        organizationId,
        ruleCode: d.ruleCode,
        title: d.title,
        description: d.description,
        category: d.category as RuleCategory,
        severity: d.severity as RuleSeverity,
      })),
      skipDuplicates: true,
    });
  }

  async create(
    db: DbClient,
    ctx: RequestContext,
    data: CreateValidationRuleData,
  ): Promise<ValidationRuleRecord> {
    const row = await db.validationRule.create({
      data: {
        organizationId: ctx.organizationId,

        ruleCode: data.ruleCode,
        title: data.title,
        description: data.description,
        legalBasisRef: data.legalBasisRef,
        severity: data.severity,
        category: data.category,
        activeFlag: data.activeFlag ?? true,

        ...this.auditCreateFields(ctx),
      },
    });

    return mapRule(row);
  }

  /**
   * Optimistic-lock update (architecture §9): applies changes only when the
   * caller's expected version matches, incrementing the version. Returns null
   * when the version is stale.
   */
  async update(
    db: DbClient,
    ctx: RequestContext,
    id: string,
    expectedVersion: number,
    data: UpdateValidationRuleData,
  ): Promise<ValidationRuleRecord | null> {
    const result = await db.validationRule.updateMany({
      where: {
        id,
        organizationId: ctx.organizationId,
        version: expectedVersion,
        deletedAt: null,
      },
      data: {
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.description !== undefined
          ? { description: data.description }
          : {}),
        ...(data.legalBasisRef !== undefined
          ? { legalBasisRef: data.legalBasisRef }
          : {}),
        ...(data.severity !== undefined ? { severity: data.severity } : {}),
        ...(data.activeFlag !== undefined ? { activeFlag: data.activeFlag } : {}),
        version: { increment: 1 },
        ...this.auditUpdateFields(ctx),
      },
    });

    if (result.count === 0) {
      return null;
    }

    const row = await db.validationRule.findFirst({
      where: {
        id,
        organizationId: ctx.organizationId,
        deletedAt: null,
      },
    });

    return row ? mapRule(row) : null;
  }

  async softDelete(
    db: DbClient,
    ctx: RequestContext,
    id: string,
  ): Promise<ValidationRuleRecord> {
    const row = await db.validationRule.update({
      where: { id },
      data: {
        activeFlag: false,
        deletedAt: new Date(),
        ...this.auditUpdateFields(ctx),
      },
    });

    return mapRule(row);
  }
}
