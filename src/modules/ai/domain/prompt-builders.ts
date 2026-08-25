export function buildExplainPrompt(entityType: string, entityData: any): { system: string; prompt: string } {
  return {
    system: 'You are a DPDP Act compliance assistant. Explain clearly why this validation failed and suggest remediation steps.',
    prompt: JSON.stringify(entityData)
  };
}

export function buildSummarizePrompt(entityType: string, entityData: any): { system: string; prompt: string } {
  return {
    system: 'You are a compliance assistant. Provide a concise summary of the following data.',
    prompt: JSON.stringify(entityData)
  };
}

export function buildDraftPrompt(draftType: string, context: any): { system: string; prompt: string } {
  return {
    system: 'You are a compliance document drafter. Draft a professional document based on the provided context.',
    prompt: JSON.stringify(context || {})
  };
}

/**
 * Build a prompt for server-side AI classification of CLI evidence findings.
 * Each finding is classified as one of: positive_evidence, reference_only, negative_evidence.
 */
export function buildClassificationPrompt(
  findings: Array<{
    sourceType: string;
    location: string;
    findingType: string;
    excerpt?: string;
    confidence: number;
    controlCandidates?: string[];
  }>,
): { system: string; prompt: string } {
  const system = [
    "You are a DPDP Act compliance AI assistant.",
    "You receive code/config/document findings from a static analysis tool.",
    "For EACH finding, classify it as exactly one of:",
    "- positive_evidence: the code/document actually implements the concept (e.g., a working deletion endpoint)",
    "- reference_only: mentions or references the concept without implementation (e.g., a comment, config key)",
    "- negative_evidence: evidence suggests the concept is absent or not implemented",
    "",
    "Respond with ONLY a JSON array. No markdown fences, no explanation.",
    "Each element must have:",
    "- location: the exact location string from the input finding",
    "- findingType: the exact findingType string from the input finding",
    "- classification: one of positive_evidence, reference_only, negative_evidence",
    "- reasoning: one sentence explaining the classification",
    "- confidence: a number between 0 and 1",
    "",
    "IMPORTANT: Use ONLY the location and findingType values provided in the input.",
    "Do not invent or modify location or findingType values.",
    "Do not include findings not present in the input.",
  ].join("\n");

  const prompt = JSON.stringify(findings, null, 2);

  return { system, prompt };
}
