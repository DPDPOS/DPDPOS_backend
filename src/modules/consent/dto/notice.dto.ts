import { z } from "zod";

export const createNoticeDtoSchema = z.object({
  title: z.string().trim().min(1).max(255),

  content: z.string().trim().min(1).max(20000),

  effectiveFrom: z.string().datetime().optional(),
});

export type CreateNoticeDto = z.infer<typeof createNoticeDtoSchema>;

export const noticeIdParamSchema = z.object({
  id: z.string().uuid(),
});
