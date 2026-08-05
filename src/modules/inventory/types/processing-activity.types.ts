export type ProcessingActivityRecord = {
  id: string;
  organizationId: string;
  dataAssetId: string;

  purpose: string;

  sourceSystem: string | null;
  recipientType: string | null;
  processorName: string | null;
  legalBasis: string | null;
  retentionRule: string | null;
  notes: string | null;

  createdBy: string | null;
  updatedBy: string | null;

  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

export type ProcessingActivityResponse = {
  id: string;
  dataAssetId: string;

  purpose: string;

  sourceSystem: string | null;
  recipientType: string | null;
  processorName: string | null;
  legalBasis: string | null;
  retentionRule: string | null;
  notes: string | null;

  createdAt: string;
  updatedAt: string;
};

export function toProcessingActivityResponse(
  activity: ProcessingActivityRecord,
): ProcessingActivityResponse {
  return {
    id: activity.id,
    dataAssetId: activity.dataAssetId,

    purpose: activity.purpose,

    sourceSystem: activity.sourceSystem,
    recipientType: activity.recipientType,
    processorName: activity.processorName,
    legalBasis: activity.legalBasis,
    retentionRule: activity.retentionRule,
    notes: activity.notes,

    createdAt: activity.createdAt.toISOString(),
    updatedAt: activity.updatedAt.toISOString(),
  };
}
