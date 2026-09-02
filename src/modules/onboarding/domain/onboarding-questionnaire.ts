import type { QuestionnaireQuestion } from "../../assessments/domain/questionnaire-types.js";
import {
  buildQuestionnaireCatalogPayload,
  getQuestionsForIndustry,
  listQuestionnaireStages,
} from "../../assessments/domain/questionnaire-catalog.js";

/**
 * Org onboarding reuses the DPDP questionnaire minus engineering-audit items
 * (those belong to per-assessment technical evidence, not first-time org setup).
 */
const ONBOARDING_EXCLUDED_STAGES = new Set(["engineering_audit"]);

export function getOnboardingQuestions(
  industry: string | null | undefined,
): QuestionnaireQuestion[] {
  return getQuestionsForIndustry(industry).filter(
    (q) => !ONBOARDING_EXCLUDED_STAGES.has(q.stageId),
  );
}

export function buildOnboardingCatalogPayload(
  industry: string | null | undefined,
) {
  const base = buildQuestionnaireCatalogPayload(industry);
  const questions = getOnboardingQuestions(industry);
  return {
    ...base,
    questions,
    stages: listQuestionnaireStages(questions),
    purpose:
      "Prerequisite DPDP discovery for your organisation. Complete once — not shown again after finish.",
  };
}

export function isAnswerProvided(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string" && value.trim() === "") return false;
  return true;
}

export function requiredOnboardingCodes(
  questions: QuestionnaireQuestion[],
  answersByCode: Map<string, unknown>,
): string[] {
  const required: string[] = [];
  for (const q of questions) {
    if (!q.required) continue;
    if (q.showIf) {
      const prior = answersByCode.get(q.showIf.code);
      if (prior !== q.showIf.equals) continue;
    }
    required.push(q.code);
  }
  return required;
}
