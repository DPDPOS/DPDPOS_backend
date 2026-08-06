import { z } from "zod";

import { VIOLATION_SEVERITIES, VIOLATION_STATUSES } from "./create-violation.dto.js";

export const violationIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const listViolationsQuerySchema = z.object({
  status: z.enum(VIOLATION_STATUSES).optional(),

  severity: z.enum(VIOLATION_SEVERITIES).optional(),

  assignedTo: z.string().uuid().optional(),
});

export const closeViolationBodySchema = z.object({
  /** Expected current version — optimistic-lock token. */
  version: z.number().int().min(1),

  resolutionSummary: z.string().trim().min(1).max(4000),
});

export type CloseViolationBody = z.infer<typeof closeViolationBodySchema>;

export type ListViolationsQuery = z.infer<typeof listViolationsQuerySchema>;
