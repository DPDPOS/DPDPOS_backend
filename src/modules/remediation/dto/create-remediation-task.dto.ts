import { z } from "zod";

export const REMEDIATION_TASK_STATUSES = [
  "PENDING",
  "IN_PROGRESS",
  "PENDING_VERIFICATION",
  "VERIFIED",
  "CLOSED",
  "CANCELLED",
] as const;

export const REMEDIATION_TASK_SOURCES = ["AUTO", "MANUAL"] as const;

export const createRemediationTaskDtoSchema = z.object({
  /** Link to the violation this task fixes. */
  violationId: z.string().uuid(),

  taskTitle: z.string().trim().min(1).max(255),

  taskDescription: z.string().trim().max(4000).optional(),

  assignedTo: z.string().uuid().optional(),

  dueAt: z.string().datetime().optional(),
});

export type CreateRemediationTaskDto = z.infer<
  typeof createRemediationTaskDtoSchema
>;
