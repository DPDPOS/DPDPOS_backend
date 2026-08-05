import { z } from "zod";

import { REMEDIATION_TASK_STATUSES } from "./create-remediation-task.dto.js";

export const updateRemediationTaskDtoSchema = z
  .object({
    /** Expected current version — optimistic-lock token (mismatch → 409). */
    version: z.number().int().min(1),

    taskTitle: z.string().trim().min(1).max(255).optional(),

    taskDescription: z.string().trim().max(4000).nullable().optional(),

    status: z.enum(REMEDIATION_TASK_STATUSES).optional(),

    assignedTo: z.string().uuid().nullable().optional(),

    dueAt: z.string().datetime().nullable().optional(),

    /** Notes recorded when the task is submitted for / passes verification. */
    verificationNotes: z.string().trim().max(4000).nullable().optional(),

    resolutionSummary: z.string().trim().max(4000).nullable().optional(),
  })
  .refine(
    (data) =>
      data.taskTitle !== undefined ||
      data.taskDescription !== undefined ||
      data.status !== undefined ||
      data.assignedTo !== undefined ||
      data.dueAt !== undefined ||
      data.verificationNotes !== undefined ||
      data.resolutionSummary !== undefined,
    { message: "At least one field to update is required" },
  );

export type UpdateRemediationTaskDto = z.infer<
  typeof updateRemediationTaskDtoSchema
>;
