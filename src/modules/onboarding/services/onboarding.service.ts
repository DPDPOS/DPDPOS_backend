import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../../../shared/errors/app-error.js";
import { withTransaction } from "../../../infrastructure/database/transaction-manager.js";
import { writeOutboxEvent } from "../../../events/outbox/outbox.repository.js";
import { DOMAIN_EVENTS } from "../../../events/types/base-event.interface.js";
import type { RequestContext } from "../../../shared/types/request-context.js";
import { organizationService } from "../../organizations/services/organization.service.js";
import type {
  OnboardingProfileDto,
  SaveOnboardingAnswersDto,
} from "../dto/onboarding.dto.js";
import {
  buildOnboardingCatalogPayload,
  getOnboardingQuestions,
  isAnswerProvided,
  requiredOnboardingCodes,
} from "../domain/onboarding-questionnaire.js";
import { OnboardingRepository } from "../repositories/onboarding.repository.js";
import {
  buildQuestionnaireWorkbook,
  parseQuestionnaireWorkbook,
} from "../../assessments/domain/questionnaire-excel.js";

const PROFILE_REQUIRED_FIELDS = [
  "industry",
  "companySize",
  "operatingRegion",
  "companyType",
  "maturityLevel",
] as const;

export type OnboardingStatusResponse = {
  completed: boolean;
  completedAt: string | null;
  profileComplete: boolean;
  missingProfileFields: string[];
  requiredAnswerCount: number;
  answeredRequiredCount: number;
  missingQuestionCodes: string[];
  /** FE should route here until completed; do not re-prompt after true. */
  requiresOnboarding: boolean;
};

export class OnboardingService {
  constructor(private readonly repo = new OnboardingRepository()) {}

  async getStatus(ctx: RequestContext): Promise<OnboardingStatusResponse> {
    const org = await this.repo.getOnboardingFlags(ctx.organizationId);
    if (!org) throw new NotFoundError("Organization not found");

    if (org.onboardingCompletedAt) {
      return {
        completed: true,
        completedAt: org.onboardingCompletedAt.toISOString(),
        profileComplete: true,
        missingProfileFields: [],
        requiredAnswerCount: 0,
        answeredRequiredCount: 0,
        missingQuestionCodes: [],
        requiresOnboarding: false,
      };
    }

    const missingProfileFields = PROFILE_REQUIRED_FIELDS.filter(
      (field) => !org[field]?.trim(),
    );
    const answers = await this.repo.listAnswers(ctx.organizationId);
    const answersByCode = new Map(
      answers.map((a) => [a.questionCode, a.valueJson]),
    );
    const questions = getOnboardingQuestions(org.industry);
    const requiredCodes = requiredOnboardingCodes(questions, answersByCode);
    const missingQuestionCodes = requiredCodes.filter(
      (code) => !isAnswerProvided(answersByCode.get(code)),
    );

    return {
      completed: false,
      completedAt: null,
      profileComplete: missingProfileFields.length === 0,
      missingProfileFields: [...missingProfileFields],
      requiredAnswerCount: requiredCodes.length,
      answeredRequiredCount: requiredCodes.length - missingQuestionCodes.length,
      missingQuestionCodes,
      requiresOnboarding: true,
    };
  }

  async getCatalog(ctx: RequestContext) {
    const org = await this.repo.getOnboardingFlags(ctx.organizationId);
    if (!org) throw new NotFoundError("Organization not found");
    const catalog = buildOnboardingCatalogPayload(org.industry);
    const answers = await this.repo.listAnswers(ctx.organizationId);
    return {
      ...catalog,
      answers: answers.map((a) => ({
        questionCode: a.questionCode,
        value: a.valueJson,
        updatedAt: a.updatedAt.toISOString(),
      })),
      status: await this.getStatus(ctx),
    };
  }

  async updateProfile(ctx: RequestContext, input: OnboardingProfileDto) {
    const org = await this.repo.getOnboardingFlags(ctx.organizationId);
    if (!org) throw new NotFoundError("Organization not found");
    if (org.onboardingCompletedAt) {
      throw new ConflictError(
        "Onboarding is already complete; update organisation settings instead",
      );
    }

    const organization = await organizationService.update(
      ctx.organizationId,
      input,
      {
        actorUserId: ctx.actorUserId,
        correlationId: ctx.correlationId,
      },
    );
    return {
      organization,
      status: await this.getStatus(ctx),
    };
  }

  async saveAnswers(ctx: RequestContext, input: SaveOnboardingAnswersDto) {
    const org = await this.repo.getOnboardingFlags(ctx.organizationId);
    if (!org) throw new NotFoundError("Organization not found");
    if (org.onboardingCompletedAt) {
      throw new ConflictError("Onboarding is already complete");
    }

    const allowed = new Set(
      getOnboardingQuestions(org.industry).map((q) => q.code),
    );
    for (const answer of input.answers) {
      if (!allowed.has(answer.questionCode)) {
        throw new ValidationError(
          `Unknown onboarding question code '${answer.questionCode}'`,
        );
      }
    }

    const saved = await withTransaction(async (tx) =>
      this.repo.upsertAnswers(tx, {
        organizationId: ctx.organizationId,
        answeredBy: ctx.actorUserId,
        answers: input.answers.map((a) => ({
          questionCode: a.questionCode,
          value: a.value,
        })),
      }),
    );

    return {
      saved,
      status: await this.getStatus(ctx),
    };
  }

  async downloadQuestionnaireTemplate(ctx: RequestContext): Promise<{
    buffer: Buffer;
    fileName: string;
  }> {
    const org = await this.repo.getOnboardingFlags(ctx.organizationId);
    if (!org) throw new NotFoundError("Organization not found");
    const questions = getOnboardingQuestions(org.industry);
    const answers = await this.repo.listAnswers(ctx.organizationId);
    const existing = new Map(
      answers.map((a) => [a.questionCode, a.valueJson] as const),
    );
    const buffer = await buildQuestionnaireWorkbook(questions, {
      title: "DPDPOS organisation onboarding questionnaire",
      existingAnswers: existing,
    });
    return {
      buffer,
      fileName: `dpdpos-onboarding-questionnaire-${org.industry ?? "core"}.xlsx`,
    };
  }

  async importQuestionnaireExcel(ctx: RequestContext, contentBase64: string) {
    const org = await this.repo.getOnboardingFlags(ctx.organizationId);
    if (!org) throw new NotFoundError("Organization not found");
    if (org.onboardingCompletedAt) {
      throw new ConflictError("Onboarding is already complete");
    }
    const questions = getOnboardingQuestions(org.industry);
    const rows = await parseQuestionnaireWorkbook(
      Buffer.from(contentBase64, "base64"),
      questions,
    );
    return this.saveAnswers(ctx, {
      answers: rows.map((r) => ({
        questionCode: r.questionCode,
        value: r.value,
      })),
    });
  }

  async complete(ctx: RequestContext) {
    const status = await this.getStatus(ctx);
    if (status.completed) {
      return {
        completed: true as const,
        completedAt: status.completedAt,
        alreadyComplete: true as const,
      };
    }

    if (!status.profileComplete) {
      throw new ValidationError(
        `Complete organisation profile before finishing onboarding (missing: ${status.missingProfileFields.join(", ")})`,
      );
    }
    if (status.missingQuestionCodes.length > 0) {
      throw new ValidationError(
        `Answer all required DPDP questions before finishing onboarding (missing: ${status.missingQuestionCodes.slice(0, 8).join(", ")})`,
      );
    }

    const completedAt = new Date();
    const answeredCount = status.answeredRequiredCount;

    await withTransaction(async (tx) => {
      await this.repo.markCompleted(tx, {
        organizationId: ctx.organizationId,
        completedBy: ctx.actorUserId,
        completedAt,
      });
      await writeOutboxEvent(tx, {
        eventType: DOMAIN_EVENTS.OrganizationOnboarded,
        organizationId: ctx.organizationId,
        actorUserId: ctx.actorUserId,
        correlationId: ctx.correlationId,
        payload: {
          organizationId: ctx.organizationId,
          completedAt: completedAt.toISOString(),
          answeredCount,
        },
      });
    });

    return {
      completed: true as const,
      completedAt: completedAt.toISOString(),
      alreadyComplete: false as const,
    };
  }
}

export const onboardingService = new OnboardingService();

/** Used by assessment gate and /auth/me. */
export async function isOrganizationOnboarded(
  organizationId: string,
): Promise<boolean> {
  const row = await new OnboardingRepository().getOnboardingFlags(organizationId);
  return Boolean(row?.onboardingCompletedAt);
}
