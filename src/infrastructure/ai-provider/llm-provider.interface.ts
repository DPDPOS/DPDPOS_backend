export interface LLMProvider {
  complete(input: {
    prompt: string;
    system?: string;
    maxTokens?: number;
  }): Promise<{ text: string; tokensIn: number; tokensOut: number }>;
}
