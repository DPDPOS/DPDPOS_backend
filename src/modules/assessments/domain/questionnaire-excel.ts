import ExcelJS from "exceljs";
import type { QuestionnaireQuestion } from "./questionnaire-types.js";
import { ValidationError } from "../../../shared/errors/app-error.js";

export type ExcelAnswerRow = {
  questionCode: string;
  value: boolean | string;
};

const HEADER = [
  "questionCode",
  "stage",
  "label",
  "helpText",
  "valueType",
  "options",
  "answer",
] as const;

function coerceAnswer(
  question: QuestionnaireQuestion,
  raw: unknown,
): boolean | string | null {
  if (raw === null || raw === undefined) return null;
  const text = String(raw).trim();
  if (!text) return null;

  if (question.valueType === "boolean") {
    const lower = text.toLowerCase();
    if (["true", "yes", "y", "1"].includes(lower)) return true;
    if (["false", "no", "n", "0"].includes(lower)) return false;
    throw new ValidationError(
      `Invalid boolean answer for ${question.code}: "${text}" (use yes/no or true/false)`,
    );
  }

  return text;
}

/** Build a fillable .xlsx workbook for the given catalog questions. */
export async function buildQuestionnaireWorkbook(
  questions: QuestionnaireQuestion[],
  opts?: { title?: string; existingAnswers?: Map<string, unknown> },
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "DPDPOS";
  workbook.created = new Date();

  const instructions = workbook.addWorksheet("Instructions");
  instructions.getColumn(1).width = 100;
  const lines = [
    opts?.title ?? "DPDPOS DPDP questionnaire",
    "",
    "1. Open the Answers sheet.",
    "2. Fill the answer column for every required row (see valueType / options).",
    "3. Boolean answers: yes/no or true/false.",
    "4. String answers: free text (security & encryption rows need detail).",
    "5. Save the file and upload it back in DPDPOS (questionnaire import).",
    "",
    "Do not rename questionCode values. Extra sheets are ignored on import.",
  ];
  lines.forEach((line, i) => {
    instructions.getCell(i + 1, 1).value = line;
  });

  const answers = workbook.addWorksheet("Answers");
  answers.columns = HEADER.map((key) => ({
    header: key,
    key,
    width: key === "label" || key === "helpText" || key === "answer" ? 48 : 18,
  }));

  const existing = opts?.existingAnswers ?? new Map();
  for (const q of questions) {
    const prior = existing.get(q.code);
    let priorDisplay = "";
    if (typeof prior === "boolean") priorDisplay = prior ? "yes" : "no";
    else if (prior != null) priorDisplay = String(prior);

    answers.addRow({
      questionCode: q.code,
      stage: q.stageLabel,
      label: q.label,
      helpText: q.helpText,
      valueType: q.valueType,
      options: q.options?.join(" | ") ?? "",
      answer: priorDisplay,
    });
  }

  // Emphasise security rows for operators filling offline.
  const security = workbook.addWorksheet("Security_notes");
  security.getColumn(1).width = 28;
  security.getColumn(2).width = 80;
  security.addRow(["Field", "Guidance"]);
  security.addRow([
    "Physical security",
    "Describe badges, CCTV, visitor logs, locked rooms, co-lo controls (maps to Q-SEC-PHYSICAL).",
  ]);
  security.addRow([
    "Encryption at rest",
    "Confirm whether primary stores encrypt personal data (Q-SEC-ENCRYPT-REST).",
  ]);
  security.addRow([
    "Database encryption",
    "Name algorithm / TDE / column encryption used in DBs (Q-SEC-ENCRYPT-DB).",
  ]);
  security.addRow([
    "Key management",
    "KMS/HSM, rotation, who can access keys (Q-SEC-KEY-MGMT).",
  ]);
  security.addRow([
    "Encryption in transit",
    "TLS for apps/APIs/admin (Q-SEC-ENCRYPT-TRANSIT).",
  ]);

  const buf = await workbook.xlsx.writeBuffer();
  return Buffer.from(buf);
}

/** Parse an uploaded workbook into answer rows validated against the catalog. */
export async function parseQuestionnaireWorkbook(
  buffer: Buffer,
  questions: QuestionnaireQuestion[],
): Promise<ExcelAnswerRow[]> {
  const byCode = new Map(questions.map((q) => [q.code, q]));
  const workbook = new ExcelJS.Workbook();
  // exceljs typings disagree with current @types/node Buffer generics
  await workbook.xlsx.load(buffer as never);

  const sheet =
    workbook.getWorksheet("Answers") ??
    workbook.worksheets.find((ws) =>
      String(ws.getRow(1).getCell(1).value ?? "")
        .toLowerCase()
        .includes("question"),
    ) ??
    workbook.worksheets[0];

  if (!sheet) {
    throw new ValidationError("Excel file has no worksheets");
  }

  const headerRow = sheet.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell((cell, col) => {
    headers[col] = String(cell.value ?? "")
      .trim()
      .toLowerCase();
  });

  let codeIdx = -1;
  let answerIdx = -1;
  for (let i = 1; i < headers.length; i++) {
    const h = headers[i] ?? "";
    if (codeIdx < 0 && (h === "questioncode" || h === "question_code" || h === "code")) {
      codeIdx = i;
    }
    if (answerIdx < 0 && (h === "answer" || h === "value")) {
      answerIdx = i;
    }
  }
  if (codeIdx < 0) codeIdx = 1;
  if (answerIdx < 0) answerIdx = Math.max(headers.length - 1, 7);

  const rows: ExcelAnswerRow[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const code = String(row.getCell(codeIdx).value ?? "").trim();
    if (!code) return;
    const question = byCode.get(code);
    if (!question) {
      throw new ValidationError(`Unknown questionCode in Excel: ${code}`);
    }
    const raw = row.getCell(answerIdx).value;
    const value = coerceAnswer(question, raw);
    if (value === null) return;
    rows.push({ questionCode: code, value });
  });

  if (rows.length === 0) {
    throw new ValidationError("No answers found in the Excel Answers sheet");
  }
  return rows;
}
