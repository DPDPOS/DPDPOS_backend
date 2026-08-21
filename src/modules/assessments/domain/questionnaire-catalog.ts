import type { QuestionnaireQuestion } from "./questionnaire-types.js";
import type { IndustryDomainKey } from "./industry-domains.js";
import {
  INDUSTRY_DOMAIN_LABELS,
  normalizeIndustry,
} from "./industry-domains.js";
import { CORE_QUESTIONNAIRE } from "./questionnaire-core.js";
import { BANKING_FINANCE_QUESTIONS } from "./industries/banking-finance.js";
import { HEALTHCARE_QUESTIONS } from "./industries/healthcare.js";
import { ECOMMERCE_RETAIL_QUESTIONS } from "./industries/ecommerce-retail.js";
import { EDUCATION_EDTECH_QUESTIONS } from "./industries/education-edtech.js";
import { IT_SAAS_QUESTIONS } from "./industries/it-saas.js";
import { TELECOM_QUESTIONS } from "./industries/telecom.js";
import { AUTOMOBILE_QUESTIONS } from "./industries/automobile.js";
import { FOOD_MANUFACTURING_QUESTIONS } from "./industries/food-manufacturing.js";
import { HOTELS_QUESTIONS } from "./industries/hotels.js";
import { SPACE_TECHNOLOGY_QUESTIONS } from "./industries/space-technology.js";

export type { QuestionnaireQuestion } from "./questionnaire-types.js";

const INDUSTRY_PACKS: Record<IndustryDomainKey, QuestionnaireQuestion[]> = {
  banking_finance: BANKING_FINANCE_QUESTIONS,
  healthcare: HEALTHCARE_QUESTIONS,
  ecommerce_retail: ECOMMERCE_RETAIL_QUESTIONS,
  education_edtech: EDUCATION_EDTECH_QUESTIONS,
  it_saas: IT_SAAS_QUESTIONS,
  telecom: TELECOM_QUESTIONS,
  automobile: AUTOMOBILE_QUESTIONS,
  food_manufacturing: FOOD_MANUFACTURING_QUESTIONS,
  hotels: HOTELS_QUESTIONS,
  space_technology: SPACE_TECHNOLOGY_QUESTIONS,
};

/** @deprecated Prefer getQuestionsForDomain — kept for imports that expect a flat list. */
export const QUESTIONNAIRE_CATALOG: QuestionnaireQuestion[] = CORE_QUESTIONNAIRE;

export function getQuestionsForDomain(
  domain: IndustryDomainKey | null,
): QuestionnaireQuestion[] {
  if (!domain) return [...CORE_QUESTIONNAIRE];
  const pack = INDUSTRY_PACKS[domain] ?? [];
  return [...CORE_QUESTIONNAIRE, ...pack];
}

export function getQuestionsForIndustry(
  industry: string | null | undefined,
): QuestionnaireQuestion[] {
  return getQuestionsForDomain(normalizeIndustry(industry));
}

export function listQuestionnaireStages(
  questions: QuestionnaireQuestion[] = CORE_QUESTIONNAIRE,
): Array<{
  stageId: string;
  stageLabel: string;
  stageOrder: number;
  questionCodes: string[];
}> {
  const map = new Map<
    string,
    { stageId: string; stageLabel: string; stageOrder: number; questionCodes: string[] }
  >();
  for (const q of questions) {
    const existing = map.get(q.stageId);
    if (existing) {
      existing.questionCodes.push(q.code);
    } else {
      map.set(q.stageId, {
        stageId: q.stageId,
        stageLabel: q.stageLabel,
        stageOrder: q.stageOrder,
        questionCodes: [q.code],
      });
    }
  }
  return [...map.values()].sort((a, b) => a.stageOrder - b.stageOrder);
}

export function buildQuestionnaireCatalogPayload(
  industry: string | null | undefined,
) {
  const domain = normalizeIndustry(industry);
  const questions = getQuestionsForDomain(domain);
  return {
    questions,
    stages: listQuestionnaireStages(questions),
    industryDomain: domain,
    industryDomainLabel: domain ? INDUSTRY_DOMAIN_LABELS[domain] : null,
    industryHint: domain
      ? null
      : "Set your organisation industry in Settings to unlock sector-specific questions.",
  };
}
