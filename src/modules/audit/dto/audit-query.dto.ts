import { z } from "zod";

export const listAuditLogsQuerySchema = z.object({
  entityType: z.string().optional(),
  actionType: z.string().optional(),
  actorUserId: z.string().uuid().optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type ListAuditLogsQuery = z.infer<typeof listAuditLogsQuerySchema>;

export const auditEntityParamsSchema = z.object({
  entityType: z.string(),
  entityId: z.string().uuid(),
});

export const exportAuditDtoSchema = z.object({
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  format: z.enum(['csv', 'pdf']).default('csv'),
});
export type ExportAuditDto = z.infer<typeof exportAuditDtoSchema>;
