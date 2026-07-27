import type { LLMProvider } from "./llm-provider.interface.js";
import { ServiceUnavailableError } from "../../shared/errors/app-error.js";

/**
 * OpenAI-compatible adapter stub — wired when AI module is implemented (Dev C).
 */
export class OpenAICompatibleAdapter implements LLMProvider {
  async complete(): Promise<{ text: string; tokensIn: number; tokensOut: number }> {
    throw new ServiceUnavailableError("LLM provider is not configured");
  }
}
