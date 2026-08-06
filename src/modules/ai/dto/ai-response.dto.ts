import type { AiUsageLog } from "@prisma/client";

export type AiUsageLogRecord = Omit<AiUsageLog, 'promptText' | 'resultText'> & {
  promptText?: string | null;
  resultText?: string | null;
};
