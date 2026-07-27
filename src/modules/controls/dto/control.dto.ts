import { z } from "zod";

export const createControlDtoSchema = z.object({
  frameworkId: z.string().uuid(),
  code: z.string().min(1).max(50),
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  ownerUserId: z.string().uuid().optional(),
  dueAt: z.coerce.date().optional(),
  legalBasisRef: z.string().optional(),
});

export const updateControlDtoSchema = createControlDtoSchema.partial().extend({
  status: z.enum(["NOT_STARTED", "IN_PROGRESS", "COMPLETED", "OVERDUE"]).optional(),
});

export type CreateControlDto = z.infer<typeof createControlDtoSchema>;
export type UpdateControlDto = z.infer<typeof updateControlDtoSchema>;
