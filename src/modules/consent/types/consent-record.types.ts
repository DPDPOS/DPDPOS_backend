import { ConsentState } from "@prisma/client";

export type ConsentRecordRecord = {
  id: string;
  organizationId: string;

  dataSubjectIdentifier: string;
  noticeId: string | null;
  dataAssetId: string | null;

  purpose: string;
  purposes: string[];
  consentState: ConsentState;
  grantedAt: Date;
  withdrawnAt: Date | null;
  expiresAt: Date | null;
  proofFileId: string | null;

  createdBy: string | null;
  updatedBy: string | null;

  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

export type ConsentRecordResponse = {
  id: string;

  dataSubjectIdentifier: string;
  noticeId: string | null;
  dataAssetId: string | null;

  purpose: string;
  purposes: string[];
  consentState: string;
  grantedAt: string;
  withdrawnAt: string | null;
  expiresAt: string | null;
  proofFileId: string | null;

  createdAt: string;
  updatedAt: string;
};

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

export function toConsentRecordResponse(
  record: ConsentRecordRecord,
): ConsentRecordResponse {
  const purposes =
    record.purposes.length > 0
      ? record.purposes
      : record.purpose
        ? [record.purpose]
        : [];
  return {
    id: record.id,

    dataSubjectIdentifier: record.dataSubjectIdentifier,
    noticeId: record.noticeId,
    dataAssetId: record.dataAssetId,

    purpose: purposes[0] ?? record.purpose,
    purposes,
    consentState: record.consentState,
    grantedAt: record.grantedAt.toISOString(),
    withdrawnAt: record.withdrawnAt
      ? record.withdrawnAt.toISOString()
      : null,
    expiresAt: record.expiresAt ? record.expiresAt.toISOString() : null,
    proofFileId: record.proofFileId,

    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export { asStringArray };
