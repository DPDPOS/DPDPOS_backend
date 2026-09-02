import { describe, expect, it } from "vitest";
import { CORE_QUESTIONNAIRE } from "../domain/questionnaire-core.js";
import {
  buildQuestionnaireWorkbook,
  parseQuestionnaireWorkbook,
} from "../domain/questionnaire-excel.js";

describe("questionnaire excel", () => {
  it("round-trips answers through generate + parse", async () => {
    const questions = CORE_QUESTIONNAIRE.filter(
      (q) => !q.showIf && q.stageId !== "engineering_audit",
    ).slice(0, 8);

    const filled = new Map<string, unknown>(
      questions.map((q) => [
        q.code,
        q.valueType === "boolean" ? true : "sample detail for security review",
      ]),
    );

    const buffer = await buildQuestionnaireWorkbook(questions, {
      title: "test",
      existingAnswers: filled,
    });
    expect(buffer.byteLength).toBeGreaterThan(1000);

    const rows = await parseQuestionnaireWorkbook(buffer, questions);
    expect(rows.length).toBe(questions.length);
    expect(rows[0]?.questionCode).toBe(questions[0]?.code);
  });

  it("includes security safeguard codes in core catalog", () => {
    const codes = CORE_QUESTIONNAIRE.map((q) => q.code);
    expect(codes).toContain("Q-SEC-PHYSICAL");
    expect(codes).toContain("Q-SEC-ENCRYPT-DB");
    expect(codes).toContain("Q-SEC-KEY-MGMT");
  });
});
