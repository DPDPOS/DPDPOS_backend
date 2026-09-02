import type { Prisma } from "@prisma/client";
import { prisma } from "../../../infrastructure/database/prisma-client.js";

type DbClient = Prisma.TransactionClient | typeof prisma;

export type OnboardingAnswerRecord = {
  questionCode: string;
  valueJson: unknown;
  answeredBy: string | null;
  updatedAt: Date;
};

export class OnboardingRepository {
  async listAnswers(organizationId: string): Promise<OnboardingAnswerRecord[]> {
    const rows = await prisma.organizationOnboardingAnswer.findMany({
      where: { organizationId },
      select: {
        questionCode: true,
        valueJson: true,
        answeredBy: true,
        updatedAt: true,
      },
    });
    return rows;
  }

  async upsertAnswers(
    db: DbClient,
    input: {
      organizationId: string;
      answeredBy: string;
      answers: Array<{ questionCode: string; value: unknown }>;
    },
  ): Promise<number> {
    let count = 0;
    for (const answer of input.answers) {
      await db.organizationOnboardingAnswer.upsert({
        where: {
          organizationId_questionCode: {
            organizationId: input.organizationId,
            questionCode: answer.questionCode,
          },
        },
        create: {
          organizationId: input.organizationId,
          questionCode: answer.questionCode,
          valueJson: answer.value as Prisma.InputJsonValue,
          answeredBy: input.answeredBy,
        },
        update: {
          valueJson: answer.value as Prisma.InputJsonValue,
          answeredBy: input.answeredBy,
        },
      });
      count += 1;
    }
    return count;
  }

  async markCompleted(
    db: DbClient,
    input: { organizationId: string; completedBy: string; completedAt: Date },
  ): Promise<void> {
    await db.organization.update({
      where: { id: input.organizationId },
      data: {
        onboardingCompletedAt: input.completedAt,
        onboardingCompletedBy: input.completedBy,
        updatedBy: input.completedBy,
      },
    });
  }

  async getOnboardingFlags(organizationId: string): Promise<{
    onboardingCompletedAt: Date | null;
    industry: string | null;
    companySize: string | null;
    operatingRegion: string | null;
    companyType: string | null;
    maturityLevel: string | null;
  } | null> {
    return prisma.organization.findFirst({
      where: { id: organizationId, deletedAt: null },
      select: {
        onboardingCompletedAt: true,
        industry: true,
        companySize: true,
        operatingRegion: true,
        companyType: true,
        maturityLevel: true,
      },
    });
  }
}
