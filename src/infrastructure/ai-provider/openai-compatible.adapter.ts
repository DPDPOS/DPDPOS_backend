import type { LLMProvider } from "./llm-provider.interface.js";
import { ServiceUnavailableError } from "../../shared/errors/app-error.js";
import { env } from "../../config/env.js";

/**
 * OpenAI-compatible chat completions adapter (Groq, OpenAI, etc.).
 * Used by assessment CLI evidence classification and the /ai assistance module.
 * Credentials come only from server env (AI_API_KEY) — never from the CLI.
 */
export class OpenAICompatibleAdapter implements LLMProvider {
  async complete(input: {
    prompt: string;
    system?: string;
    maxTokens?: number;
  }): Promise<{ text: string; tokensIn: number; tokensOut: number }> {
    if (!env.AI_API_KEY || !env.AI_BASE_URL || !env.AI_MODEL) {
      throw new ServiceUnavailableError("LLM provider is not configured");
    }

    const response = await fetch(`${env.AI_BASE_URL.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.AI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: env.AI_MODEL,
        max_tokens: input.maxTokens ?? env.AI_MAX_TOKENS,
        messages: [
          ...(input.system ? [{ role: "system", content: input.system }] : []),
          { role: "user", content: input.prompt },
        ],
      }),
    });
    if (!response.ok) {
      throw new ServiceUnavailableError(`LLM provider returned HTTP ${response.status}`);
    }

    const body = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const text = body.choices?.[0]?.message?.content;
    if (!text) throw new ServiceUnavailableError("LLM provider returned an empty response");
    return {
      text,
      tokensIn: body.usage?.prompt_tokens ?? 0,
      tokensOut: body.usage?.completion_tokens ?? 0,
    };
  }
}
