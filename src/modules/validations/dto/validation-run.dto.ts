import { z } from "zod";

export const RUN_STATUSES = [
  "PENDING",
  "RUNNING",
  "COMPLETED",
  "PARTIAL",
  "FAILED",
] as const;

export const createValidationRunDtoSchema = z.object({
  /** Optional explicit trigger — API callers use MANUAL. */
  triggerType: z.literal("MANUAL").optional(),
});

export type CreateValidationRunDto = z.infer<
  typeof createValidationRunDtoSchema
>;

export const validationRunIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const listValidationRunsQuerySchema = z.object({
  status: z.enum(RUN_STATUSES).optional(),
});

export type ListValidationRunsQuery = z.infer<
  typeof listValidationRunsQuerySchema
>;
