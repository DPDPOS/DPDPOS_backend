import { z } from "zod";

export const ReportTypeEnum = z.enum([
  "COMPLIANCE_SUMMARY",
  "BOARD_PACK",
  "VIOLATION_REPORT",
  "EVIDENCE_REPORT",
  "VALIDATION_REPORT",
  "CONSENT_REPORT",
  "RIGHTS_REPORT",
  "AUDIT_REPORT",
]);

export const ReportFormatEnum = z.enum(["PDF", "CSV", "EXCEL"]);
export const ReportStatusEnum = z.enum(["PENDING", "GENERATING", "COMPLETED", "FAILED"]);

export const generateReportDtoSchema = z.object({
  reportType: ReportTypeEnum,
  title: z.string().optional(),
  format: ReportFormatEnum.optional().default("CSV"),
  parameters: z
    .object({
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
      status: z.string().optional(),
      controlId: z.string().uuid().optional(),
      violationId: z.string().uuid().optional(),
    })
    .passthrough()
    .optional(),
});

export type GenerateReportDto = z.infer<typeof generateReportDtoSchema>;

export const reportIdParamSchema = z.object({ id: z.string().uuid() });

export const listReportsQuerySchema = z.object({
  reportType: ReportTypeEnum.optional(),
  status: ReportStatusEnum.optional(),
  page: z.coerce.number().min(1).optional().default(1),
  pageSize: z.coerce.number().min(1).max(100).optional().default(20),
});

export type ListReportsQuery = z.infer<typeof listReportsQuerySchema>;
