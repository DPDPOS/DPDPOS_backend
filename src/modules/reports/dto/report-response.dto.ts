export interface ReportRecord {
  id: string;
  organizationId: string;
  reportType: string;
  title: string;
  status: string;
  format: string;
  generatedBy: string | null;
  storageKey: string | null;
  parameters: any | null;
  startedAt: Date | null;
  completedAt: Date | null;
  errorMessage: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}
