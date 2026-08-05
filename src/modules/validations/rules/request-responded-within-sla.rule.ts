import type { ValidationRuleEvaluator } from "../domain/rule-evaluator.interface.js";
import type { RuleEvaluationInput } from "../domain/rule-evaluation.types.js";

export class RequestRespondedWithinSlaRule implements ValidationRuleEvaluator {
  readonly descriptor = {
    code: "request-responded-within-sla",
    title: "Data principal requests are responded to within SLA",
    description:
      "Closed rights requests must be closed before their SLA due date; open requests must not be past due.",
    category: "RIGHTS",
    severity: "HIGH",
  } as const;

  async evaluate(input: RuleEvaluationInput) {
    const requests = input.dataSubjectRequests.filter((r) => !r.deletedAt);

    if (requests.length === 0) {
      return {
        status: "PASS" as const,
        score: 100,
        explanation: "No data principal requests registered.",
      };
    }

    const now = Date.now();
    const overdueOpen = requests.filter(
      (r) =>
        !r.closedAt &&
        r.status !== "CLOSED" &&
        r.status !== "REJECTED" &&
        r.dueAt &&
        r.dueAt.getTime() < now,
    );

    const lateClosed = requests.filter(
      (r) =>
        r.closedAt &&
        r.dueAt &&
        r.closedAt.getTime() > r.dueAt.getTime(),
    );

    const failures = overdueOpen.length + lateClosed.length;

    if (failures > 0) {
      const parts: string[] = [];
      if (overdueOpen.length > 0) {
        parts.push(`${overdueOpen.length} open request(s) past their SLA due date`);
      }
      if (lateClosed.length > 0) {
        parts.push(
          `${lateClosed.length} request(s) closed after their SLA due date`,
        );
      }
      return {
        status: "FAIL" as const,
        score: Math.max(
          0,
          Math.round(((requests.length - failures) / requests.length) * 100),
        ),
        explanation: `${parts.join("; ")}. Respond to requests within the statutory SLA window.`,
        evidenceRequired: true,
      };
    }

    return {
      status: "PASS" as const,
      score: 100,
      explanation: `All ${requests.length} request(s) responded to within SLA.`,
    };
  }
}
