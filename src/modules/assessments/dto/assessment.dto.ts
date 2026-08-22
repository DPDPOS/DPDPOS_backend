import { z } from "zod";

export const createAssessmentSchema = z.object({
  name: z.string().min(1).max(200),
});
export type CreateAssessmentDto = z.infer<typeof createAssessmentSchema>;

export const assessmentIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const scanIdParamSchema = z.object({
  id: z.string().uuid(),
  scanId: z.string().uuid(),
});

export const assessmentDocumentTypeSchema = z.enum([
  "PRIVACY_NOTICE",
  "CONSENT_POLICY",
  "RETENTION_POLICY",
  "BREACH_POLICY",
  "RIGHTS_SOP",
  "VENDOR_DPA",
  "SECURITY_POLICY",
  "OTHER",
]);

export const uploadDocumentSchema = z.object({
  fileName: z.string().min(1).max(255),
  fileType: z.string().min(1).max(100),
  documentType: assessmentDocumentTypeSchema.default("OTHER"),
  contentBase64: z.string().optional(),
  extractedText: z.string().optional(),
});
export type UploadDocumentDto = z.infer<typeof uploadDocumentSchema>;

export const initiateDocumentSchema = z.object({
  fileName: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(200),
  documentType: assessmentDocumentTypeSchema,
});
export type InitiateDocumentDto = z.infer<typeof initiateDocumentSchema>;

export const confirmDocumentSchema = z.object({
  fileHash: z.string().min(16).max(128),
  fileSizeBytes: z.number().int().nonnegative(),
  extractedText: z.string().max(500_000).optional(),
});
export type ConfirmDocumentDto = z.infer<typeof confirmDocumentSchema>;

export const documentIdParamSchema = z.object({
  id: z.string().uuid(),
  documentId: z.string().uuid(),
});

export const questionnaireAnswersSchema = z.object({
  answers: z
    .array(
      z.object({
        questionCode: z.string().min(1).max(80),
        value: z.union([z.string(), z.boolean(), z.number(), z.null()]),
      }),
    )
    .min(1),
});
export type QuestionnaireAnswersDto = z.infer<typeof questionnaireAnswersSchema>;

export const createCliTokenSchema = z.object({
  label: z.string().min(1).max(100),
  expiresInDays: z.number().int().positive().max(365).optional(),
});
export type CreateCliTokenDto = z.infer<typeof createCliTokenSchema>;

export const createScanSchema = z.object({
  targetType: z.string().min(1).max(40),
  targetPath: z.string().min(1).max(1000),
  cliVersion: z.string().min(1).max(40),
});
export type CreateScanDto = z.infer<typeof createScanSchema>;

export const findingSchema = z.object({
  sourceType: z.enum(["CODE", "CONFIG", "DOCUMENT"]),
  location: z.string().min(1).max(500),
  findingType: z.string().min(1).max(100),
  excerpt: z.string().max(2000).optional(),
  confidence: z.number().min(0).max(1),
  controlCandidates: z.array(z.string()).default([]),
  sourceHash: z.string().max(128).optional(),
});

/**
 * Optional AI enrichment context from dpdp-cli --ai.
 * Informational only — does NOT affect deterministic control evaluation.
 */
export const aiClassificationSchema = z.object({
  location: z.string().min(1).max(500),
  findingType: z.string().min(1).max(100),
  classification: z.enum([
    "positive_evidence",
    "reference_only",
    "negative_evidence",
  ]),
  reasoning: z.string().min(1).max(2000),
  confidence: z.number().min(0).max(1),
});

export const aiContextSchema = z.object({
  classifiedAt: z.string().min(1).max(100),
  provider: z.string().min(1).max(100),
  model: z.string().min(1).max(100),
  classifications: z.array(aiClassificationSchema).min(1).max(5000),
});

export const evidenceBatchSchema = z.object({
  scanJobId: z.string().uuid(),
  findings: z.array(findingSchema).min(1).max(5000),
  aiContext: aiContextSchema.optional(),
});
export type EvidenceBatchDto = z.infer<typeof evidenceBatchSchema>;

export const createVersionSchema = z.object({
  label: z.string().min(1).max(100).optional(),
});
export type CreateVersionDto = z.infer<typeof createVersionSchema>;

export const evaluateSchema = z.object({}).passthrough();
