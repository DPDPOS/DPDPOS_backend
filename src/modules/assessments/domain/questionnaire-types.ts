export type QuestionnaireQuestion = {
  code: string;
  stageId: string;
  stageLabel: string;
  stageOrder: number;
  label: string;
  helpText: string;
  valueType: "boolean" | "string";
  options?: string[];
  required?: boolean;
  /** Conditional visibility based on a prior answer. */
  showIf?: { code: string; equals: string | boolean };
  /** When set, question belongs to an industry pack (null/undefined = core). */
  industryDomain?: string;
};
