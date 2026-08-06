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
