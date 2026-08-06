import { z } from "zod";

import { REMEDIATION_TASK_STATUSES } from "./create-remediation-task.dto.js";

export const remediationTaskIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const listRemediationTasksQuerySchema = z.object({
  status: z.enum(REMEDIATION_TASK_STATUSES).optional(),

  violationId: z.string().uuid().optional(),

  assignedTo: z.string().uuid().optional(),
});

export const closeRemediationTaskBodySchema = z.object({
  /** Expected current version — optimistic-lock token. */
  version: z.number().int().min(1),

  resolutionSummary: z.string().trim().min(1).max(4000),
});

export type CloseRemediationTaskBody = z.infer<
  typeof closeRemediationTaskBodySchema
>;

export type ListRemediationTasksQuery = z.infer<
  typeof listRemediationTasksQuerySchema
>;
