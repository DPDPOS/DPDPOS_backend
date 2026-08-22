import { z } from "zod";

export const vendorTypeSchema = z.enum([
  "PROCESSOR",
  "SUB_PROCESSOR",
  "JOINT",
  "OTHER",
]);
export const vendorCriticalitySchema = z.enum([
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
]);
export const vendorStatusSchema = z.enum([
  "DRAFT",
  "ACTIVE",
  "SUSPENDED",
  "OFFBOARDED",
]);

export const createVendorDtoSchema = z.object({
  name: z.string().trim().min(1).max(255),
  legalName: z.string().trim().max(255).optional(),
  vendorType: vendorTypeSchema.optional(),
  countries: z.array(z.string().trim().min(1).max(8)).max(50).optional(),
  services: z.string().trim().max(2000).optional(),
  dataCategories: z.array(z.string().trim().min(1).max(100)).max(50).optional(),
  criticality: vendorCriticalitySchema.optional(),
  status: vendorStatusSchema.optional(),
  nextReviewAt: z.string().datetime().optional(),
  ownerUserId: z.string().uuid().optional(),
  notes: z.string().trim().max(4000).optional(),
});

export type CreateVendorDto = z.infer<typeof createVendorDtoSchema>;

export const updateVendorDtoSchema = createVendorDtoSchema
  .partial()
  .extend({
    version: z.number().int().positive(),
  });

export type UpdateVendorDto = z.infer<typeof updateVendorDtoSchema>;

export const vendorIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const listVendorsQuerySchema = z.object({
  status: vendorStatusSchema.optional(),
  criticality: vendorCriticalitySchema.optional(),
  vendorType: vendorTypeSchema.optional(),
});

export const createVendorAgreementDtoSchema = z.object({
  title: z.string().trim().min(1).max(255),
  versionLabel: z.string().trim().min(1).max(50),
  status: z.enum(["DRAFT", "ACTIVE", "EXPIRED", "SUPERSEDED"]).optional(),
  effectiveFrom: z.string().datetime().optional(),
  expiresAt: z.string().datetime().optional(),
  storageKey: z.string().trim().max(500).optional(),
  evidenceFileId: z.string().uuid().optional(),
  allowsSubProcessors: z.boolean().optional(),
  crossBorderAllowed: z.boolean().optional(),
  breachNotifyHours: z.number().int().min(1).max(720).optional(),
  notes: z.string().trim().max(4000).optional(),
});

export type CreateVendorAgreementDto = z.infer<
  typeof createVendorAgreementDtoSchema
>;

export const updateVendorAgreementDtoSchema =
  createVendorAgreementDtoSchema.partial();

export const createVendorReviewDtoSchema = z.object({
  outcome: z
    .enum(["APPROVED", "CONDITIONAL", "REJECTED", "PENDING"])
    .optional(),
  residualRisk: vendorCriticalitySchema.optional(),
  dueAt: z.string().datetime().optional(),
  questionnaireJson: z.record(z.string(), z.unknown()).optional(),
  notes: z.string().trim().max(4000).optional(),
  evidenceFileIds: z.array(z.string().uuid()).max(20).optional(),
  complete: z.boolean().optional(),
});

export type CreateVendorReviewDto = z.infer<typeof createVendorReviewDtoSchema>;

export const createVendorRelationshipDtoSchema = z.object({
  childVendorId: z.string().uuid(),
  relationshipType: z.enum([
    "SUB_PROCESSOR",
    "AFFILIATE",
    "RESELLER",
    "OTHER",
  ]),
  personalDataFlows: z.boolean().optional(),
  notificationRequired: z.boolean().optional(),
  notes: z.string().trim().max(2000).optional(),
});

export type CreateVendorRelationshipDto = z.infer<
  typeof createVendorRelationshipDtoSchema
>;

export const acknowledgeRelationshipDtoSchema = z.object({
  relationshipId: z.string().uuid(),
});
