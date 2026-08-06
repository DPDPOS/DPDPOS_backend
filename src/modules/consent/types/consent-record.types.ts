import { ConsentState } from "@prisma/client";

export type ConsentRecordRecord = {
  id: string;
  organizationId: string;

  dataSubjectIdentifier: string;
  noticeId: string | null;
  dataAssetId: string | null;

  purpose: string;
  consentState: ConsentState;
  grantedAt: Date;
  withdrawnAt: Date | null;
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
  consentState: string;
  grantedAt: string;
  withdrawnAt: string | null;
  proofFileId: string | null;

  createdAt: string;
  updatedAt: string;
};

export function toConsentRecordResponse(
  record: ConsentRecordRecord,
): ConsentRecordResponse {
  return {
    id: record.id,

    dataSubjectIdentifier: record.dataSubjectIdentifier,
    noticeId: record.noticeId,
    dataAssetId: record.dataAssetId,

    purpose: record.purpose,
    consentState: record.consentState,
    grantedAt: record.grantedAt.toISOString(),
    withdrawnAt: record.withdrawnAt
      ? record.withdrawnAt.toISOString()
      : null,
    proofFileId: record.proofFileId,

    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
