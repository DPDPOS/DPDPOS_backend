import { z } from "zod";

import { VIOLATION_SEVERITIES, VIOLATION_STATUSES } from "./create-violation.dto.js";

export const updateViolationDtoSchema = z
  .object({
    /** Expected current version — optimistic-lock token (mismatch → 409). */
    version: z.number().int().min(1),

    title: z.string().trim().min(1).max(255).optional(),

    description: z.string().trim().max(4000).nullable().optional(),

    severity: z.enum(VIOLATION_SEVERITIES).optional(),

    status: z.enum(VIOLATION_STATUSES).optional(),

    assignedTo: z.string().uuid().nullable().optional(),

    dueAt: z.string().datetime().nullable().optional(),

    resolutionSummary: z.string().trim().max(4000).nullable().optional(),
  })
  .refine(
    (data) =>
      data.title !== undefined ||
      data.description !== undefined ||
      data.severity !== undefined ||
      data.status !== undefined ||
      data.assignedTo !== undefined ||
      data.dueAt !== undefined ||
      data.resolutionSummary !== undefined,
    { message: "At least one field to update is required" },
  );

export type UpdateViolationDto = z.infer<typeof updateViolationDtoSchema>;
