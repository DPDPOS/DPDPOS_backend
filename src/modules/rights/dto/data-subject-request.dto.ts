import { z } from "zod";

export const REQUEST_TYPES = [
  "ACCESS",
  "CORRECTION",
  "COMPLETION",
  "UPDATING",
  "ERASURE",
  "GRIEVANCE_REDRESSAL",
  "NOMINATION",
] as const;

export const REQUEST_STATUSES = [
  "SUBMITTED",
  "ASSIGNED",
  "IN_PROGRESS",
  "RESPONDED",
  "REJECTED",
  "CLOSED",
] as const;

export const createDataSubjectRequestDtoSchema = z.object({
  requestType: z.enum(REQUEST_TYPES),

  requesterReference: z.string().trim().min(1).max(500),

  assignedTo: z.string().uuid().optional(),

  /** For ERASURE: skip cooling-off and allow immediate hard-erase path. */
  immediateErase: z.boolean().optional(),

  coolingOffDays: z.number().int().min(1).max(30).optional(),
});

export type CreateDataSubjectRequestDto = z.infer<
  typeof createDataSubjectRequestDtoSchema
>;

export const updateDataSubjectRequestDtoSchema = z
  .object({
    /** Expected current version — optimistic-lock token (mismatch → 409). */
    version: z.number().int().min(1),

    assignedTo: z.string().uuid().nullable().optional(),

    status: z.enum(REQUEST_STATUSES).optional(),

    resolutionSummary: z.string().trim().max(4000).nullable().optional(),
  })
  .refine(
    (data) =>
      data.assignedTo !== undefined ||
      data.status !== undefined ||
      data.resolutionSummary !== undefined,
    { message: "At least one field to update is required" },
  );

export type UpdateDataSubjectRequestDto = z.infer<
  typeof updateDataSubjectRequestDtoSchema
>;

export const dataSubjectRequestIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const listDataSubjectRequestsQuerySchema = z.object({
  requestType: z.enum(REQUEST_TYPES).optional(),

  status: z.enum(REQUEST_STATUSES).optional(),

  assignedTo: z.string().uuid().optional(),
});

export type ListDataSubjectRequestsQuery = z.infer<
  typeof listDataSubjectRequestsQuerySchema
>;

export const startErasureDtoSchema = z.object({
  immediate: z.boolean().optional(),
  coolingOffDays: z.number().int().min(1).max(30).optional(),
});

export const confirmErasureItemDtoSchema = z.object({
  systemKey: z.string().trim().min(1).max(200),
  status: z.enum(["DONE", "SKIPPED", "FAILED"]),
  notes: z.string().trim().max(2000).optional(),
});
