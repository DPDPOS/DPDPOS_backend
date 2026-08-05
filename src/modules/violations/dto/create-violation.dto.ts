import { z } from "zod";

export const VIOLATION_SEVERITIES = [
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
] as const;

export const VIOLATION_STATUSES = [
  "OPEN",
  "TRIAGE",
  "ASSIGNED",
  "IN_PROGRESS",
  "PENDING_EVIDENCE",
  "VALIDATED",
  "CLOSED",
  "ARCHIVED",
] as const;

export const createViolationDtoSchema = z.object({
  /** Optional link to the validation result that produced this finding. */
  validationResultId: z.string().uuid().optional(),

  severity: z.enum(VIOLATION_SEVERITIES),

  title: z.string().trim().min(1).max(255),

  description: z.string().trim().max(4000).optional(),

  assignedTo: z.string().uuid().optional(),

  dueAt: z.string().datetime().optional(),
});

export type CreateViolationDto = z.infer<typeof createViolationDtoSchema>;
