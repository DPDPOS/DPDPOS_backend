import { DataAssetStatus, DataSensitivity } from "@prisma/client";

export type DataAssetRecord = {
  id: string;
  organizationId: string;
  departmentId: string | null;
  ownerUserId: string | null;

  assetName: string;
  assetType: string;
  category: string;

  sensitivity: DataSensitivity;

  description: string | null;

  storageLocation: string | null;
  retentionPeriod: string | null;

  status: DataAssetStatus;

  createdBy: string | null;
  updatedBy: string | null;

  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

export type DataAssetResponse = {
  id: string;

  assetName: string;
  assetType: string;
  category: string;

  sensitivity: string;

  description: string | null;

  storageLocation: string | null;
  retentionPeriod: string | null;

  departmentId: string | null;
  ownerUserId: string | null;

  status: string;

  createdAt: string;
  updatedAt: string;
};

export function toDataAssetResponse(
  asset: DataAssetRecord,
): DataAssetResponse {
  return {
    id: asset.id,

    assetName: asset.assetName,
    assetType: asset.assetType,
    category: asset.category,

    sensitivity: asset.sensitivity,

    description: asset.description,

    storageLocation: asset.storageLocation,
    retentionPeriod: asset.retentionPeriod,

    departmentId: asset.departmentId,
    ownerUserId: asset.ownerUserId,

    status: asset.status,

    createdAt: asset.createdAt.toISOString(),
    updatedAt: asset.updatedAt.toISOString(),
  };
}