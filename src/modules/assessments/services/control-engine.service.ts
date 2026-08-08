import type { ControlEvalStatus } from "@prisma/client";
import {
  ASSESSMENT_CONTROL_REGISTRY,
  type AssessmentControlDef,
} from "../domain/control-registry.js";
import { DOCUMENT_TYPE_CONTROL_HINTS } from "../domain/document-types.js";

type FindingLite = {
  id: string;
  findingType: string;
  controlCandidates: string[];
  location: string;
  confidence: number;
};

type AnswerLite = {
  questionCode: string;
  valueJson: unknown;
};

export type ControlEvalResult = {
  controlCode: string;
  status: ControlEvalStatus;
  severity: string;
  reasoning: string;
  evidenceRefs: Array<{ kind: string; ref: string }>;
};

function truthyAnswer(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const v = value.toLowerCase();
    if (["true", "yes", "y", "1"].includes(v)) return true;
    if (["false", "no", "n", "0"].includes(v)) return false;
  }
  return null;
}

function documentTypeSupportsControl(
  controlCode: string,
  documentTypes: string[],
): string | null {
  for (const docType of documentTypes) {
    const hints = DOCUMENT_TYPE_CONTROL_HINTS[docType] ?? [];
    if (hints.includes(controlCode)) return docType;
  }
  return null;
}

function evaluateOne(
  control: AssessmentControlDef,
  findings: FindingLite[],
  answers: AnswerLite[],
  docText: string,
  documentTypes: string[],
): ControlEvalResult {
  const matchedFindings = findings.filter(
    (f) =>
      f.controlCandidates.includes(control.code) ||
      control.findingTypes.includes(f.findingType),
  );
  const keywordHit = control.docKeywords.some((kw) =>
    docText.toLowerCase().includes(kw.toLowerCase()),
  );
  const typedDoc = documentTypeSupportsControl(control.code, documentTypes);
  const docsHit = keywordHit || Boolean(typedDoc);

  const qAnswers = control.questionCodes.map((code) => {
    const row = answers.find((a) => a.questionCode === code);
    return { code, value: truthyAnswer(row?.valueJson) };
  });

  if (control.code === "DPDP-SDF-DPO") {
    const sdf = truthyAnswer(
      answers.find((a) => a.questionCode === "Q-SDF")?.valueJson,
    );
    if (sdf === false) {
      return {
        controlCode: control.code,
        status: "NOT_APPLICABLE",
        severity: control.severity,
        reasoning: "Organization indicated it is not an SDF.",
        evidenceRefs: [{ kind: "questionnaire", ref: "Q-SDF=false" }],
      };
    }
  }

  // Vendor DPA N/A when no vendors
  if (control.code === "DPDP-VENDOR-DPA") {
    const vendors = truthyAnswer(
      answers.find((a) => a.questionCode === "Q-VENDORS")?.valueJson,
    );
    if (vendors === false) {
      return {
        controlCode: control.code,
        status: "NOT_APPLICABLE",
        severity: control.severity,
        reasoning: "No vendors/processors reported.",
        evidenceRefs: [{ kind: "questionnaire", ref: "Q-VENDORS=false" }],
      };
    }
  }

  const evidenceRefs: Array<{ kind: string; ref: string }> = [];
  for (const f of matchedFindings.slice(0, 8)) {
    evidenceRefs.push({ kind: "finding", ref: `${f.findingType}@${f.location}` });
  }
  if (typedDoc) {
    evidenceRefs.push({ kind: "document_type", ref: typedDoc });
  } else if (keywordHit) {
    evidenceRefs.push({ kind: "document", ref: "keyword-match" });
  }
  for (const q of qAnswers) {
    if (q.value !== null) {
      evidenceRefs.push({ kind: "questionnaire", ref: `${q.code}=${q.value}` });
    }
  }

  const positiveQ = qAnswers.some((q) => q.value === true);
  const negativeQ = qAnswers.some((q) => q.value === false);
  const hasTech = matchedFindings.length > 0;
  const strongTech = matchedFindings.some((f) => f.confidence >= 0.85);
  const strongDoc = Boolean(typedDoc);

  let status: ControlEvalStatus = "UNKNOWN";
  let reasoning = "Insufficient evidence.";

  if ((hasTech && (positiveQ || docsHit)) || (strongTech && strongDoc)) {
    status = "PASS";
    reasoning =
      "Technical findings and supporting questionnaire/document evidence present.";
  } else if (strongDoc && positiveQ) {
    status = "PASS";
    reasoning =
      "Matching policy document uploaded and questionnaire affirms the control.";
  } else if (hasTech || (positiveQ && docsHit) || (strongDoc && !negativeQ)) {
    status = "PARTIAL";
    reasoning = "Some evidence present but coverage incomplete.";
  } else if (positiveQ && !hasTech && !docsHit) {
    status = "PARTIAL";
    reasoning =
      "Self-attested via questionnaire without uploaded policy or technical corroboration.";
  } else if (negativeQ && !hasTech && !docsHit) {
    status = "FAIL";
    reasoning =
      "Questionnaire indicates control not implemented and no corroborating evidence found.";
  } else if (docsHit && !hasTech && !negativeQ) {
    status = "PARTIAL";
    reasoning =
      "Document evidence suggests control intent; technical proof missing.";
  }

  return {
    controlCode: control.code,
    status,
    severity: control.severity,
    reasoning,
    evidenceRefs,
  };
}

export function evaluateControls(input: {
  findings: FindingLite[];
  answers: AnswerLite[];
  documentTexts: string[];
  documentTypes?: string[];
}): { score: number; results: ControlEvalResult[]; summary: Record<string, number> } {
  const docText = input.documentTexts.join("\n");
  const documentTypes = input.documentTypes ?? [];
  const results = ASSESSMENT_CONTROL_REGISTRY.map((c) =>
    evaluateOne(c, input.findings, input.answers, docText, documentTypes),
  );

  const summary = {
    pass: results.filter((r) => r.status === "PASS").length,
    partial: results.filter((r) => r.status === "PARTIAL").length,
    fail: results.filter((r) => r.status === "FAIL").length,
    unknown: results.filter((r) => r.status === "UNKNOWN").length,
    notApplicable: results.filter((r) => r.status === "NOT_APPLICABLE").length,
  };

  const scored = results.filter((r) => r.status !== "NOT_APPLICABLE");
  const points = scored.reduce((acc, r) => {
    if (r.status === "PASS") return acc + 1;
    if (r.status === "PARTIAL") return acc + 0.5;
    return acc;
  }, 0);
  const score =
    scored.length === 0 ? 0 : Math.round((points / scored.length) * 1000) / 10;

  return { score, results, summary };
}
