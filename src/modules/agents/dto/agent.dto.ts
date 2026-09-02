import { z } from "zod";

export const enrollAgentSchema = z.object({
  enrollmentToken: z.string().min(20),
  csrPem: z.string().includes("BEGIN CERTIFICATE REQUEST"),
  agentName: z.string().trim().min(1).max(120).optional(),
  instanceKey: z.string().trim().min(1).max(200).optional(),
  agentVersion: z.string().trim().min(1).max(64).default("unknown"),
  platform: z.string().trim().min(1).max(120).optional(),
  hostname: z.string().trim().min(1).max(255).optional(),
  zoneName: z.string().trim().min(1).max(120).optional(),
  capabilities: z.array(z.string().trim().min(1)).max(100).default([]),
});

export const heartbeatSchema = z.object({
  targetHealth: z.enum(["HEALTHY", "DEGRADED", "UNHEALTHY"]),
  metrics: z.record(z.string(), z.unknown()).optional(),
  version: z.string().max(64).optional(),
});

export const rotateCertificateSchema = z.object({
  csrPem: z.string().includes("BEGIN CERTIFICATE REQUEST"),
});

export const taskResultSchema = z.object({
  status: z.enum(["COMPLETED", "FAILED"]),
  result: z.unknown(),
  signature: z.string().min(1).optional(),
  proof: z.record(z.string(), z.unknown()).optional(),
});

const discoveryFieldSchema = z.object({
  externalId: z.string().min(1).max(512),
  name: z.string().min(1).max(512),
  path: z.string().max(2048).optional(),
  dataType: z.string().max(256).optional(),
  nullable: z.boolean().optional(),
  pii: z.boolean(),
  piiCategory: z.string().max(128).optional(),
  confidence: z.number().min(0).max(1).optional(),
  tags: z.array(z.string().max(128)).optional(),
  isIdentifier: z.boolean().optional(),
  identityHashes: z
    .array(z.string().regex(/^[a-f0-9]{64}$/))
    .max(10_000)
    .optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const discoveryAssetSchema = z.object({
  externalId: z.string().min(1).max(512),
  name: z.string().min(1).max(512),
  assetType: z.enum(["TABLE", "COLLECTION", "BUCKET", "FILE", "ENDPOINT", "OTHER"]),
  path: z.string().max(2048).optional(),
  recordCountEstimate: z.number().int().nonnegative().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  fields: z.array(discoveryFieldSchema).max(100_000),
});

const discoverySystemSchema = z.object({
  externalId: z.string().min(1).max(512),
  externalSystemKey: z.string().min(1).max(512).optional(),
  name: z.string().min(1).max(512),
  systemType: z.enum(["DATABASE", "OBJECT_STORE", "SAAS", "FILE_SYSTEM", "API", "OTHER"]),
  connectorKey: z.string().max(256).optional(),
  environment: z.string().max(128).optional(),
  location: z.string().max(512).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  assets: z.array(discoveryAssetSchema).max(100_000),
});

export const discoverySchema = z.object({
  schemaVersion: z.literal("1.0"),
  reportId: z.string().uuid(),
  agentId: z.string().uuid(),
  revision: z.number().int().positive(),
  discoveredAt: z.iso.datetime(),
  reportHash: z.string().regex(/^[a-f0-9]{64}$/),
  systems: z.array(discoverySystemSchema).max(10_000),
  piiMap: z.unknown().optional(),
  findings: z.array(z.unknown()).max(100_000).optional(),
});

export const agentIdParamSchema = z.object({ id: z.string().uuid() });
export const taskIdParamSchema = z.object({ taskId: z.string().uuid() });

export type EnrollAgentDto = z.infer<typeof enrollAgentSchema>;
export type HeartbeatDto = z.infer<typeof heartbeatSchema>;
export type TaskResultDto = z.infer<typeof taskResultSchema>;
export type DiscoveryDto = z.infer<typeof discoverySchema>;
