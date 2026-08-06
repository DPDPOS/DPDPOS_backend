const SENSITIVE_KEYS = /(?:email|phone|mobile|address|password|secret|token|requesterReference)/i;

/** Removes direct identifiers before any context is sent to an LLM provider. */
export function sanitizeAiContext(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeAiContext);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => !SENSITIVE_KEYS.test(key))
        .map(([key, item]) => [key, sanitizeAiContext(item)]),
    );
  }
  return value;
}
