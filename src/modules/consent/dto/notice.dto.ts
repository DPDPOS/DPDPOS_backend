import { z } from "zod";

export const createNoticeDtoSchema = z.object({
  title: z.string().trim().min(1).max(255),

  content: z.string().trim().min(1).max(20000),

  contentFormat: z.enum(["PLAIN", "MARKDOWN"]).optional(),

  effectiveFrom: z.string().datetime().optional(),
});

export type CreateNoticeDto = z.infer<typeof createNoticeDtoSchema>;

export const noticeIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const noticeDiffQuerySchema = z.object({
  againstVersion: z.coerce.number().int().positive(),
});

export type NoticeDiffQuery = z.infer<typeof noticeDiffQuerySchema>;
