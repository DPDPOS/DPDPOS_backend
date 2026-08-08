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

export type EvaluationSummary = {
  pass: number;
  partial: number;
  fail: number;
  unknown: number;
  notApplicable: number;
  /** Explicit product framing — not a legal certification. */
  scoreKind: "READINESS";
  disclaimer: string;
  evidenceCeilingApplied: boolean;
  ceilingReason: string | null;
  profile: {
    processesChildren: boolean | null;
    crossBorder: boolean | null;
    isSdf: boolean | null;
    hasVendors: boolean | null;
  };
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

function answerFor(answers: AnswerLite[], code: string): boolean | null {
  return truthyAnswer(answers.find((a) => a.questionCode === code)?.valueJson);
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

/**
 * Product rule: PASS requires corroboration.
 * - Typed document alone (no searchable text) is weak.
 * - Questionnaire yes alone never PASSes.
 * - Tech finding + (affirmative Q or keyword doc) can PASS.
 * - Keyword doc + affirmative Q can PASS (policy-backed attestation).
 */
function evaluateOne(
  control: AssessmentControlDef,
  findings: FindingLite[],
  answers: AnswerLite[],
  docText: string,
  documentTypes: string[],
  profile: EvaluationSummary["profile"],
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
  /** Searchable policy text — not mere file presence. */
  const strongDoc = keywordHit;
  /** File tagged for this control but no extractable/pasted text. */
  const weakDoc = Boolean(typedDoc) && !keywordHit;

  const qAnswers = control.questionCodes.map((code) => {
    const row = answers.find((a) => a.questionCode === code);
    return { code, value: truthyAnswer(row?.valueJson) };
  });

  // —— Profile-driven applicability ——
  if (control.code === "DPDP-SDF-DPO") {
    if (profile.isSdf === false) {
      return {
        controlCode: control.code,
        status: "NOT_APPLICABLE",
        severity: control.severity,
        reasoning: "Not classified as SDF — DPO appointment duty not triggered by profile.",
        evidenceRefs: [{ kind: "questionnaire", ref: "Q-SDF=false" }],
      };
    }
  }

  if (control.code === "DPDP-VENDOR-DPA" || control.code === "DPDP-VENDOR-INVENTORY") {
    if (profile.hasVendors === false) {
      return {
        controlCode: control.code,
        status: "NOT_APPLICABLE",
        severity: control.severity,
        reasoning: "No vendors/processors reported — vendor controls not applicable.",
        evidenceRefs: [{ kind: "questionnaire", ref: "Q-VENDORS=false" }],
      };
    }
  }

  // Children processing raises the bar for consent/notice controls.
  const childrenSensitive =
    profile.processesChildren === true &&
    (control.code.startsWith("DPDP-CONSENT") || control.code === "DPDP-CONSENT-NOTICE");

  const crossBorderSensitive =
    profile.crossBorder === true &&
    (control.code.startsWith("DPDP-VENDOR") || control.code === "DPDP-CONSENT-NOTICE");

  let severity = control.severity;
  if (childrenSensitive || crossBorderSensitive) {
    if (severity === "MEDIUM") severity = "HIGH";
    else if (severity === "HIGH") severity = "CRITICAL";
  }

  const evidenceRefs: Array<{ kind: string; ref: string }> = [];
  for (const f of matchedFindings.slice(0, 8)) {
    evidenceRefs.push({ kind: "finding", ref: `${f.findingType}@${f.location}` });
  }
  if (strongDoc) {
    evidenceRefs.push({
      kind: "document",
      ref: typedDoc ? `${typedDoc}:keyword` : "keyword-match",
    });
  } else if (weakDoc && typedDoc) {
    evidenceRefs.push({ kind: "document_type", ref: `${typedDoc}:no-text` });
  }
  for (const q of qAnswers) {
    if (q.value !== null) {
      evidenceRefs.push({ kind: "questionnaire", ref: `${q.code}=${q.value}` });
    }
  }
  if (childrenSensitive) {
    evidenceRefs.push({ kind: "profile", ref: "Q-CHILDREN-DATA=true" });
  }
  if (crossBorderSensitive) {
    evidenceRefs.push({ kind: "profile", ref: "Q-CROSS-BORDER=true" });
  }

  const positiveQ = qAnswers.some((q) => q.value === true);
  const negativeQ = qAnswers.some((q) => q.value === false);
  const unanswered = qAnswers.every((q) => q.value === null);
  const hasTech = matchedFindings.length > 0;
  const strongTech = matchedFindings.some((f) => f.confidence >= 0.85);

  let status: ControlEvalStatus = "UNKNOWN";
  let reasoning = "Insufficient evidence across questionnaire, policy text, and CLI findings.";

  // Hard FAIL: org says no, and nothing contradicts.
  if (negativeQ && !hasTech && !strongDoc) {
    status = "FAIL";
    reasoning =
      "Questionnaire indicates the control is not implemented, with no policy text or technical findings to contradict that.";
  } else if (
    (hasTech && (positiveQ || strongDoc)) ||
    (strongTech && strongDoc) ||
    (strongDoc && positiveQ && !childrenSensitive)
  ) {
    // PASS only with triangulation (tech+doc/Q, or strong doc+Q).
    // Children-sensitive consent needs tech OR fails to PARTIAL below.
    if (childrenSensitive && !hasTech) {
      status = "PARTIAL";
      reasoning =
        "Children’s data processing raises the bar: policy + questionnaire are present, but CLI technical corroboration is still required for PASS.";
    } else if (crossBorderSensitive && !hasTech && !strongDoc) {
      status = "PARTIAL";
      reasoning =
        "Cross-border processing flagged — need transferable safeguards evidenced in policy text or technical controls.";
    } else {
      status = "PASS";
      reasoning =
        "Corroborated readiness: technical and/or searchable policy evidence supports the questionnaire answer. Not a legal certification.";
    }
  } else if (positiveQ && !hasTech && !strongDoc) {
    status = "PARTIAL";
    reasoning = weakDoc
      ? "Self-attested with a typed document file, but no searchable extracted text — paste OCR/text or upload a text-extractable file for stronger credit."
      : "Self-attested via questionnaire only. Upload policy text and/or submit CLI findings to raise this beyond PARTIAL.";
  } else if (hasTech && !positiveQ && !strongDoc) {
    status = "PARTIAL";
    reasoning =
      "CLI findings suggest technical capability, but questionnaire/policy corroboration is missing.";
  } else if (strongDoc && !positiveQ && !negativeQ) {
    status = "PARTIAL";
    reasoning =
      "Searchable policy text matches this control, but questionnaire answer is incomplete.";
  } else if (weakDoc) {
    status = "PARTIAL";
    reasoning =
      "A document was tagged for this control, but without extracted text the engine cannot verify content.";
  } else if (unanswered && !hasTech && !strongDoc) {
    status = "UNKNOWN";
    reasoning = "No questionnaire answer, policy text, or CLI finding for this control.";
  }

  return {
    controlCode: control.code,
    status,
    severity,
    reasoning,
    evidenceRefs,
  };
}

export function evaluateControls(input: {
  findings: FindingLite[];
  answers: AnswerLite[];
  documentTexts: string[];
  documentTypes?: string[];
}): {
  score: number;
  results: ControlEvalResult[];
  summary: EvaluationSummary;
} {
  const docText = input.documentTexts.join("\n");
  const documentTypes = input.documentTypes ?? [];
  const profile: EvaluationSummary["profile"] = {
    processesChildren: answerFor(input.answers, "Q-CHILDREN-DATA"),
    crossBorder: answerFor(input.answers, "Q-CROSS-BORDER"),
    isSdf: answerFor(input.answers, "Q-SDF"),
    hasVendors: answerFor(input.answers, "Q-VENDORS"),
  };

  const results = ASSESSMENT_CONTROL_REGISTRY.map((c) =>
    evaluateOne(c, input.findings, input.answers, docText, documentTypes, profile),
  );

  const summaryBase = {
    pass: results.filter((r) => r.status === "PASS").length,
    partial: results.filter((r) => r.status === "PARTIAL").length,
    fail: results.filter((r) => r.status === "FAIL").length,
    unknown: results.filter((r) => r.status === "UNKNOWN").length,
    notApplicable: results.filter((r) => r.status === "NOT_APPLICABLE").length,
  };

  const scored = results.filter((r) => r.status !== "NOT_APPLICABLE");
  const points = scored.reduce((acc, r) => {
    if (r.status === "PASS") return acc + 1;
    if (r.status === "PARTIAL") return acc + 0.45;
    return acc;
  }, 0);
  let score =
    scored.length === 0 ? 0 : Math.round((points / scored.length) * 1000) / 10;

  // Evidence ceilings — turn “thin CLI / no text” into an honest advantage.
  const hasAnyFinding = input.findings.length > 0;
  const hasSearchableDocs = input.documentTexts.some((t) => t.trim().length > 40);
  let evidenceCeilingApplied = false;
  let ceilingReason: string | null = null;

  if (!hasAnyFinding && score > 55) {
    score = 55;
    evidenceCeilingApplied = true;
    ceilingReason =
      "Score capped at 55 without CLI technical evidence — questionnaire/docs alone cannot claim high readiness.";
  } else if (hasAnyFinding && !hasSearchableDocs && score > 75) {
    score = 75;
    evidenceCeilingApplied = true;
    ceilingReason =
      "Score capped at 75 without searchable policy text — upload extractable files or paste extracted text.";
  }

  const summary: EvaluationSummary = {
    ...summaryBase,
    scoreKind: "READINESS",
    disclaimer:
      "Readiness score only — deterministic gap signal from questionnaire + policy text + CLI findings. Not legal advice or DPDP certification.",
    evidenceCeilingApplied,
    ceilingReason,
    profile,
  };

  return { score, results, summary };
}
