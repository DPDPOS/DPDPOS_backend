import { describe, expect, it } from "vitest";
import { sanitizeAiContext } from "../domain/context-builders/sanitize-ai-context.js";

describe("sanitizeAiContext", () => {
  it("removes direct identifiers recursively before prompting an LLM", () => {
    expect(sanitizeAiContext({ email: "person@example.com", nested: { phone: "123", title: "Issue" } }))
      .toEqual({ nested: { title: "Issue" } });
  });
});
