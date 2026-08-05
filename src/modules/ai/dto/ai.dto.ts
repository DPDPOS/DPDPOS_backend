import { z } from "zod";

export const aiExplainDtoSchema = z.object({
  entityType: z.enum(['validation_result', 'violation']),
  entityId: z.string().uuid()
});
export type AiExplainDto = z.infer<typeof aiExplainDtoSchema>;

export const aiSummarizeDtoSchema = z.object({
  entityType: z.enum(['evidence', 'violation', 'validation_run']),
  entityId: z.string().uuid()
});
export type AiSummarizeDto = z.infer<typeof aiSummarizeDtoSchema>;

export const aiDraftDtoSchema = z.object({
  draftType: z.enum(['notice', 'remediation_plan']),
  context: z.record(z.string(), z.unknown()).optional()
});
export type AiDraftDto = z.infer<typeof aiDraftDtoSchema>;

export const aiRequestIdParamSchema = z.object({
  id: z.string().uuid()
});
