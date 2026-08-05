import { z } from "zod";

export const listNotificationsQuerySchema = z.object({
  status: z.enum(["PENDING", "SENT", "FAILED", "READ"]).optional(),
  notificationType: z.string().optional(),
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(100).default(20),
});

export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>;

export const notificationIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const updatePreferencesDtoSchema = z.object({
  email: z.boolean().optional(),
  inApp: z.boolean().optional(),
  slack: z.boolean().optional(),
});

export type UpdatePreferencesDto = z.infer<typeof updatePreferencesDtoSchema>;
