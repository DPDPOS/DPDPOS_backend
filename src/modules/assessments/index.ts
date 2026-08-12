export { createAssessmentRouter } from "./routes/assessment.routes.js";
export { assessmentService } from "./services/assessment.service.js";
export { ASSESSMENT_CONTROL_REGISTRY } from "./domain/control-registry.js";
export {
  QUESTIONNAIRE_CATALOG,
  getQuestionsForDomain,
  getQuestionsForIndustry,
} from "./domain/questionnaire-catalog.js";
export {
  INDUSTRY_DOMAIN_KEYS,
  INDUSTRY_DOMAIN_LABELS,
  INDUSTRY_DOMAIN_OPTIONS,
  normalizeIndustry,
} from "./domain/industry-domains.js";
