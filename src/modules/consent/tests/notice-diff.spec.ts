import { describe, expect, it } from "vitest";
import { buildUnifiedDiff } from "../services/notice.service.js";

describe("buildUnifiedDiff", () => {
  it("marks unchanged content", () => {
    const diff = buildUnifiedDiff("v1", "v2", "same", "same");
    expect(diff).toContain("--- v1");
    expect(diff).toContain("@@ unchanged @@");
  });

  it("shows line replacements", () => {
    const diff = buildUnifiedDiff("v1", "v2", "a\nb", "a\nc");
    expect(diff).toContain("-b");
    expect(diff).toContain("+c");
  });
});
