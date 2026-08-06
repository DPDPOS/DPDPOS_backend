import { z } from "zod";

export const dashboardQuerySchema = z.object({
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
});

export type DashboardQuery = z.infer<typeof dashboardQuerySchema>;
