import { describe, expect, it } from "vitest";
import { ViolationService } from "../services/violation.service.js";

describe("ViolationService.openOrDedupe API surface", () => {
  it("exposes openOrDedupe for CLI and agent enforcement spine", () => {
    const svc = new ViolationService();
    expect(typeof svc.openOrDedupe).toBe("function");
    expect(typeof svc.createFromAssessmentControlFail).toBe("function");
    expect(typeof svc.createFromValidationFailed).toBe("function");
  });
});
