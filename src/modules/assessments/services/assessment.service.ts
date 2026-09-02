import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { prisma } from "../../../infrastructure/database/prisma-client.js";
import {
  NotFoundError,
  ValidationError,
  ForbiddenError,
} from "../../../shared/errors/app-error.js";
import type { RequestContext } from "../../../shared/types/request-context.js";
import { hashToken } from "../../auth/utils/token-crypto.js";
import { appConfig } from "../../../config/app.config.js";
import { getS3Client } from "../../../infrastructure/storage/s3-adapter.js";
import { s3Config } from "../../../config/s3.config.js";
import { logger } from "../../../infrastructure/logging/logger.js";
import { OpenAICompatibleAdapter } from "../../../infrastructure/ai-provider/openai-compatible.adapter.js";
import { buildClassificationPrompt } from "../../ai/domain/prompt-builders.js";
import { sanitizeAiContext } from "../../ai/domain/context-builders/sanitize-ai-context.js";
import { env } from "../../../config/env.js";
import { appendAssessmentAudit } from "./assessment-audit.service.js";
import { evaluateControls } from "./control-engine.service.js";
import { resolveFrameworkCode } from "../../controls/domain/control-catalog.js";
import type {
  ConfirmDocumentDto,
  CreateAssessmentDto,
  CreateCliTokenDto,
  CreateScanDto,
  CreateVersionDto,
  EvidenceBatchDto,
  InitiateDocumentDto,
  QuestionnaireAnswersDto,
  UploadDocumentDto,
} from "../dto/assessment.dto.js";
import type { CliAuthContext } from "../middleware/authenticate-cli.middleware.js";
import {
  buildQuestionnaireCatalogPayload,
  getQuestionsForIndustry,
} from "../domain/questionnaire-catalog.js";
import { isOrganizationOnboarded } from "../../onboarding/services/onboarding.service.js";
import {
  ASSESSMENT_DOCUMENT_TYPES,
  ASSESSMENT_DOCUMENT_TYPE_LABELS,
} from "../domain/document-types.js";
import {
  buildQuestionnaireWorkbook,
  parseQuestionnaireWorkbook,
} from "../domain/questionnaire-excel.js";
import { INDUSTRY_DOMAIN_OPTIONS } from "../domain/industry-domains.js";
import { violationService } from "../../violations/services/violation.service.js";

/** Free-text answers that act as narrative evidence when no policy PDFs are uploaded. */
const NARRATIVE_ANSWER_CODES = new Set([
  "Q-SEC-PHYSICAL",
  "Q-SEC-ENCRYPT-DB",
  "Q-SEC-KEY-MGMT",
]);

async function requireAssessment(organizationId: string, assessmentId: string) {
  const row = await prisma.assessment.findFirst({
    where: { id: assessmentId, organizationId, deletedAt: null },
  });
  if (!row) throw new NotFoundError("Assessment not found");
  return row;
}

async function organizationIndustry(organizationId: string): Promise<string | null> {
  const org = await prisma.organization.findFirst({
    where: { id: organizationId },
    select: { industry: true },
  });
  return org?.industry ?? null;
}

/**
 * Valid classification values returned by the AI provider.
 */
const VALID_CLASSIFICATIONS = new Set(["positive_evidence", "reference_only", "negative_evidence"]);

type AiClassificationStatus = "COMPLETED" | "FAILED" | "SKIPPED";

/** Derive CLI-facing AI status from persisted ScanJob.aiContext (never from client input). */
function deriveAiClassificationStatus(
  aiContext: unknown,
): AiClassificationStatus | undefined {
  if (!aiContext || typeof aiContext !== "object") return undefined;
  const ctx = aiContext as Record<string, unknown>;
  if (ctx.status === "FAILED") return "FAILED";
  if (Array.isArray(ctx.classifications) && ctx.classifications.length > 0) {
    return "COMPLETED";
  }
  return undefined;
}

/** Best-effort JSON array extraction from LLM text (fences / leading prose). */
function parseAiJsonArray(text: string): unknown {
  const cleaned = text.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("[");
    const end = cleaned.lastIndexOf("]");
    if (start >= 0 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1));
    }
    throw new Error("AI returned invalid JSON");
  }
}

/**
 * Server-side AI classification of CLI evidence findings.
 * Calls Groq (via OpenAI-compatible adapter) to classify each finding.
 * Returns a validated aiContext object or throws on failure.
 */
async function classifyFindingsWithAI(
  findings: Array<{
    sourceType: string;
    location: string;
    findingType: string;
    excerpt?: string;
    confidence: number;
    controlCandidates?: string[];
  }>,
): Promise<Record<string, unknown>> {
  const llm = new OpenAICompatibleAdapter();
  const sanitized = sanitizeAiContext(findings) as typeof findings;
  const { system, prompt } = buildClassificationPrompt(sanitized);

  const result = await llm.complete({ prompt, system });

  const parsed = parseAiJsonArray(result.text);

  if (!Array.isArray(parsed)) {
    throw new Error("AI response is not an array");
  }

  // Build a lookup of valid input finding keys.
  const validKeys = new Set(findings.map((f) => `${f.location}|${f.findingType}`));

  const classifications = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object") continue;
    const { location, findingType, classification, reasoning, confidence } = item as Record<string, unknown>;

    // Validate required fields exist
    if (typeof location !== "string" || typeof findingType !== "string") continue;
    if (typeof classification !== "string" || !VALID_CLASSIFICATIONS.has(classification)) continue;
    if (typeof reasoning !== "string" || reasoning.length === 0) continue;
    if (typeof confidence !== "number" || confidence < 0 || confidence > 1) continue;

    // Reject fabricated locations/types: only accept results matching actual input findings.
    if (!validKeys.has(`${location}|${findingType}`)) continue;

    classifications.push({ location, findingType, classification, reasoning, confidence });
  }

  if (classifications.length === 0) {
    throw new Error("AI produced no valid classifications matching input findings");
  }

  return {
    classifiedAt: new Date().toISOString(),
    provider: "groq",
    model: env.AI_MODEL ?? "unknown",
    status: "COMPLETED",
    classifications,
  };
}

export class AssessmentService {
  async getQuestionnaireCatalog(ctx: RequestContext) {
    const industry = await organizationIndustry(ctx.organizationId);
    const catalog = buildQuestionnaireCatalogPayload(industry);
    return {
      ...catalog,
      documentTypes: ASSESSMENT_DOCUMENT_TYPES.map((value) => ({
        value,
        label: ASSESSMENT_DOCUMENT_TYPE_LABELS[value],
      })),
      industryOptions: INDUSTRY_DOMAIN_OPTIONS,
    };
  }

  async create(ctx: RequestContext, dto: CreateAssessmentDto) {
    const onboarded = await isOrganizationOnboarded(ctx.organizationId);
    if (!onboarded) {
      throw new ValidationError(
        "Complete organisation DPDP onboarding before creating assessments. See GET /api/v1/onboarding/status.",
      );
    }

    const assessment = await prisma.$transaction(async (tx) => {
      const created = await tx.assessment.create({
        data: {
          organizationId: ctx.organizationId,
          name: dto.name,
          status: "IN_PROGRESS",
          currentVersion: 1,
          createdBy: ctx.actorUserId,
          updatedBy: ctx.actorUserId,
        },
      });
      await tx.assessmentVersion.create({
        data: {
          assessmentId: created.id,
          organizationId: ctx.organizationId,
          versionNumber: 1,
          label: "baseline",
          createdBy: ctx.actorUserId,
        },
      });

      // Seed from org-level onboarding answers so operators are not re-prompted.
      const orgAnswers = await tx.organizationOnboardingAnswer.findMany({
        where: { organizationId: ctx.organizationId },
      });
      for (const a of orgAnswers) {
        await tx.questionnaireAnswer.upsert({
          where: {
            assessmentId_versionNumber_questionCode: {
              assessmentId: created.id,
              versionNumber: 1,
              questionCode: a.questionCode,
            },
          },
          create: {
            assessmentId: created.id,
            organizationId: ctx.organizationId,
            versionNumber: 1,
            questionCode: a.questionCode,
            valueJson: a.valueJson as Prisma.InputJsonValue,
            answeredBy: ctx.actorUserId,
          },
          update: {},
        });
      }

      await appendAssessmentAudit({
        tx,
        assessmentId: created.id,
        organizationId: ctx.organizationId,
        actorType: "USER",
        actorUserId: ctx.actorUserId,
        action: "ASSESSMENT_CREATED",
        objectType: "Assessment",
        objectId: created.id,
        payload: {
          name: dto.name,
          seededFromOnboarding: orgAnswers.length,
        },
      });
      return created;
    });
    return assessment;
  }

  async list(ctx: RequestContext) {
    return prisma.assessment.findMany({
      where: { organizationId: ctx.organizationId, deletedAt: null },
      orderBy: { createdAt: "desc" },
    });
  }

  async getById(ctx: RequestContext, assessmentId: string) {
    return requireAssessment(ctx.organizationId, assessmentId);
  }

  async listDocuments(ctx: RequestContext, assessmentId: string) {
    const assessment = await requireAssessment(ctx.organizationId, assessmentId);
    return prisma.assessmentDocument.findMany({
      where: {
        assessmentId,
        organizationId: ctx.organizationId,
        versionNumber: assessment.currentVersion,
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        fileName: true,
        fileType: true,
        documentType: true,
        mimeType: true,
        fileSizeBytes: true,
        uploadStatus: true,
        checksum: true,
        versionNumber: true,
        createdAt: true,
        storageKey: true,
      },
    });
  }

  async listAnswers(ctx: RequestContext, assessmentId: string) {
    const assessment = await requireAssessment(ctx.organizationId, assessmentId);
    return prisma.questionnaireAnswer.findMany({
      where: {
        assessmentId,
        organizationId: ctx.organizationId,
        versionNumber: assessment.currentVersion,
      },
      orderBy: { questionCode: "asc" },
    });
  }

  async listScans(ctx: RequestContext, assessmentId: string) {
    const assessment = await requireAssessment(ctx.organizationId, assessmentId);
    return prisma.scanJob.findMany({
      where: {
        assessmentId,
        organizationId: ctx.organizationId,
        versionNumber: assessment.currentVersion,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async uploadDocument(
    ctx: RequestContext,
    assessmentId: string,
    dto: UploadDocumentDto,
  ) {
    const assessment = await requireAssessment(ctx.organizationId, assessmentId);
    const checksumSource = dto.contentBase64 ?? dto.extractedText ?? dto.fileName;
    const checksum = createHash("sha256").update(checksumSource).digest("hex");

    const doc = await prisma.$transaction(async (tx) => {
      const created = await tx.assessmentDocument.create({
        data: {
          assessmentId,
          organizationId: ctx.organizationId,
          versionNumber: assessment.currentVersion,
          fileName: dto.fileName,
          fileType: dto.fileType,
          documentType: dto.documentType ?? "OTHER",
          mimeType: dto.fileType,
          contentBase64: dto.contentBase64,
          extractedText: dto.extractedText,
          checksum,
          uploadStatus: "READY",
          createdBy: ctx.actorUserId,
        },
      });
      await tx.assessment.update({
        where: { id: assessmentId },
        data: { status: "IN_PROGRESS", updatedBy: ctx.actorUserId },
      });
      await appendAssessmentAudit({
        tx,
        assessmentId,
        organizationId: ctx.organizationId,
        actorType: "USER",
        actorUserId: ctx.actorUserId,
        action: "DOCUMENT_UPLOADED",
        objectType: "AssessmentDocument",
        objectId: created.id,
        payload: {
          fileName: dto.fileName,
          checksum,
          documentType: dto.documentType ?? "OTHER",
        },
      });
      return created;
    });

    return {
      id: doc.id,
      fileName: doc.fileName,
      fileType: doc.fileType,
      documentType: doc.documentType,
      checksum: doc.checksum,
      versionNumber: doc.versionNumber,
      uploadStatus: doc.uploadStatus,
    };
  }

  async initiateDocumentUpload(
    ctx: RequestContext,
    assessmentId: string,
    dto: InitiateDocumentDto,
  ) {
    const assessment = await requireAssessment(ctx.organizationId, assessmentId);
    const id = randomUUID();
    const storageKey = `assessments/${ctx.organizationId}/${assessmentId}/${id}/${dto.fileName}`;
    const s3Client = await getS3Client();

    const doc = await prisma.$transaction(async (tx) => {
      const created = await tx.assessmentDocument.create({
        data: {
          id,
          assessmentId,
          organizationId: ctx.organizationId,
          versionNumber: assessment.currentVersion,
          fileName: dto.fileName,
          fileType: dto.mimeType,
          mimeType: dto.mimeType,
          documentType: dto.documentType,
          storageKey,
          checksum: "pending",
          uploadStatus: "PENDING",
          createdBy: ctx.actorUserId,
        },
      });
      await tx.assessment.update({
        where: { id: assessmentId },
        data: { status: "IN_PROGRESS", updatedBy: ctx.actorUserId },
      });
      return created;
    });

    const uploadUrl = await getSignedUrl(
      s3Client,
      new PutObjectCommand({
        Bucket: s3Config.bucket,
        Key: storageKey,
        ContentType: dto.mimeType,
      }),
      { expiresIn: 3600 },
    );

    return { document: doc, uploadUrl };
  }

  async confirmDocumentUpload(
    ctx: RequestContext,
    assessmentId: string,
    documentId: string,
    dto: ConfirmDocumentDto,
  ) {
    await requireAssessment(ctx.organizationId, assessmentId);
    const existing = await prisma.assessmentDocument.findFirst({
      where: { id: documentId, assessmentId, organizationId: ctx.organizationId },
    });
    if (!existing) throw new NotFoundError("Document not found");

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.assessmentDocument.update({
        where: { id: documentId },
        data: {
          checksum: dto.fileHash,
          fileSizeBytes: dto.fileSizeBytes,
          extractedText: dto.extractedText,
          uploadStatus: "READY",
        },
      });
      await appendAssessmentAudit({
        tx,
        assessmentId,
        organizationId: ctx.organizationId,
        actorType: "USER",
        actorUserId: ctx.actorUserId,
        action: "DOCUMENT_UPLOADED",
        objectType: "AssessmentDocument",
        objectId: documentId,
        payload: {
          fileName: row.fileName,
          documentType: row.documentType,
          fileSizeBytes: dto.fileSizeBytes,
        },
      });
      return row;
    });

    return updated;
  }

  async getDocumentDownloadUrl(
    ctx: RequestContext,
    assessmentId: string,
    documentId: string,
  ) {
    await requireAssessment(ctx.organizationId, assessmentId);
    const doc = await prisma.assessmentDocument.findFirst({
      where: { id: documentId, assessmentId, organizationId: ctx.organizationId },
    });
    if (!doc) throw new NotFoundError("Document not found");
    if (!doc.storageKey) {
      throw new ValidationError("Document has no object storage key");
    }
    const s3Client = await getS3Client();
    const downloadUrl = await getSignedUrl(
      s3Client,
      new GetObjectCommand({
        Bucket: s3Config.bucket,
        Key: doc.storageKey,
      }),
      { expiresIn: 3600 },
    );
    return { downloadUrl, fileName: doc.fileName, mimeType: doc.mimeType };
  }

  async saveQuestionnaire(
    ctx: RequestContext,
    assessmentId: string,
    dto: QuestionnaireAnswersDto,
  ) {
    const assessment = await requireAssessment(ctx.organizationId, assessmentId);

    const saved = await prisma.$transaction(async (tx) => {
      const rows = [];
      for (const answer of dto.answers) {
        const row = await tx.questionnaireAnswer.upsert({
          where: {
            assessmentId_versionNumber_questionCode: {
              assessmentId,
              versionNumber: assessment.currentVersion,
              questionCode: answer.questionCode,
            },
          },
          create: {
            assessmentId,
            organizationId: ctx.organizationId,
            versionNumber: assessment.currentVersion,
            questionCode: answer.questionCode,
            valueJson: answer.value as Prisma.InputJsonValue,
            answeredBy: ctx.actorUserId,
          },
          update: {
            valueJson: answer.value as Prisma.InputJsonValue,
            answeredBy: ctx.actorUserId,
          },
        });
        rows.push(row);
      }
      await tx.assessment.update({
        where: { id: assessmentId },
        data: { status: "IN_PROGRESS", updatedBy: ctx.actorUserId },
      });
      await appendAssessmentAudit({
        tx,
        assessmentId,
        organizationId: ctx.organizationId,
        actorType: "USER",
        actorUserId: ctx.actorUserId,
        action: "QUESTIONNAIRE_ANSWERED",
        objectType: "QuestionnaireAnswer",
        objectId: assessmentId,
        payload: { count: rows.length, version: assessment.currentVersion },
      });
      return rows;
    });

    return { saved: saved.length, versionNumber: assessment.currentVersion };
  }

  async downloadQuestionnaireTemplate(ctx: RequestContext): Promise<{
    buffer: Buffer;
    fileName: string;
  }> {
    const industry = await organizationIndustry(ctx.organizationId);
    const questions = getQuestionsForIndustry(industry);
    const buffer = await buildQuestionnaireWorkbook(questions, {
      title: "DPDPOS assessment questionnaire",
    });
    return {
      buffer,
      fileName: `dpdpos-assessment-questionnaire-${industry ?? "core"}.xlsx`,
    };
  }

  async importQuestionnaireExcel(
    ctx: RequestContext,
    assessmentId: string,
    fileBase64: string,
  ) {
    const industry = await organizationIndustry(ctx.organizationId);
    const questions = getQuestionsForIndustry(industry);
    const buffer = Buffer.from(fileBase64, "base64");
    const rows = await parseQuestionnaireWorkbook(buffer, questions);
    return this.saveQuestionnaire(ctx, assessmentId, {
      answers: rows.map((r) => ({
        questionCode: r.questionCode,
        value: r.value,
      })),
    });
  }

  async createCliToken(
    ctx: RequestContext,
    assessmentId: string,
    dto: CreateCliTokenDto,
  ) {
    await requireAssessment(ctx.organizationId, assessmentId);
    const raw = `dpdp_${randomBytes(24).toString("base64url")}`;
    const tokenHash = hashToken(raw);
    const expiresAt =
      dto.expiresInDays != null
        ? new Date(Date.now() + dto.expiresInDays * 24 * 60 * 60 * 1000)
        : null;

    const row = await prisma.$transaction(async (tx) => {
      const created = await tx.cliToken.create({
        data: {
          assessmentId,
          organizationId: ctx.organizationId,
          label: dto.label,
          tokenHash,
          tokenPrefix: raw.slice(0, 12),
          expiresAt,
          createdBy: ctx.actorUserId,
        },
      });
      await appendAssessmentAudit({
        tx,
        assessmentId,
        organizationId: ctx.organizationId,
        actorType: "USER",
        actorUserId: ctx.actorUserId,
        action: "CLI_TOKEN_CREATED",
        objectType: "CliToken",
        objectId: created.id,
        payload: { label: dto.label, prefix: created.tokenPrefix },
      });
      return created;
    });

    return {
      id: row.id,
      token: raw,
      label: row.label,
      expiresAt: row.expiresAt,
      instructions: {
        install: "npm install -g dpdp-cli",
        login: `dpdp login --token ${raw} --api ${appConfig.apiPublicUrl}`,
        configure: `dpdp configure --assessment ${assessmentId}`,
        scan: "dpdp scan ./path-to-your-code",
        submit: "dpdp submit",
      },
    };
  }

  async createScan(cli: CliAuthContext, assessmentId: string, dto: CreateScanDto) {
    if (cli.assessmentId !== assessmentId) {
      throw new ForbiddenError("CLI token mismatch");
    }
    const assessment = await requireAssessment(cli.organizationId, assessmentId);
    const job = await prisma.$transaction(async (tx) => {
      const created = await tx.scanJob.create({
        data: {
          assessmentId,
          organizationId: cli.organizationId,
          versionNumber: assessment.currentVersion,
          targetType: dto.targetType,
          targetPath: dto.targetPath,
          cliVersion: dto.cliVersion,
          status: "RUNNING",
        },
      });
      await appendAssessmentAudit({
        tx,
        assessmentId,
        organizationId: cli.organizationId,
        actorType: "CLI",
        action: "SCAN_STARTED",
        objectType: "ScanJob",
        objectId: created.id,
        payload: {
          targetType: dto.targetType,
          targetPath: dto.targetPath,
          cliVersion: dto.cliVersion,
        },
      });
      return created;
    });
    return job;
  }

  async getScan(cli: CliAuthContext, assessmentId: string, scanId: string) {
    if (cli.assessmentId !== assessmentId) {
      throw new ForbiddenError("CLI token mismatch");
    }
    const job = await prisma.scanJob.findFirst({
      where: {
        id: scanId,
        assessmentId,
        organizationId: cli.organizationId,
      },
    });
    if (!job) throw new NotFoundError("Scan job not found");
    const aiClassificationStatus = deriveAiClassificationStatus(job.aiContext);
    return aiClassificationStatus
      ? { ...job, aiClassificationStatus }
      : job;
  }

  async submitEvidenceBatch(
    cli: CliAuthContext,
    assessmentId: string,
    dto: EvidenceBatchDto,
  ) {
    if (cli.assessmentId !== assessmentId) {
      throw new ForbiddenError("CLI token mismatch");
    }
    const assessment = await requireAssessment(cli.organizationId, assessmentId);
    const job = await prisma.scanJob.findFirst({
      where: {
        id: dto.scanJobId,
        assessmentId,
        organizationId: cli.organizationId,
      },
    });
    if (!job) throw new NotFoundError("Scan job not found");
    if (job.versionNumber !== assessment.currentVersion) {
      throw new ValidationError("Scan job belongs to a previous assessment version");
    }

    // 1. Store findings and complete the scan (atomic, deterministic).
    const result = await prisma.$transaction(async (tx) => {
      await tx.cliFinding.createMany({
        data: dto.findings.map((f) => ({
          assessmentId,
          organizationId: cli.organizationId,
          scanJobId: job.id,
          versionNumber: assessment.currentVersion,
          sourceType: f.sourceType,
          location: f.location,
          findingType: f.findingType,
          excerpt: f.excerpt,
          confidence: f.confidence,
          controlCandidates: f.controlCandidates ?? [],
          sourceHash: f.sourceHash,
        })),
      });
      const updated = await tx.scanJob.update({
        where: { id: job.id },
        data: {
          status: "COMPLETED",
          findingsCount: dto.findings.length,
          finishedAt: new Date(),
        },
      });
      await tx.assessment.update({
        where: { id: assessmentId },
        data: { status: "READY_FOR_EVALUATION" },
      });
      await appendAssessmentAudit({
        tx,
        assessmentId,
        organizationId: cli.organizationId,
        actorType: "CLI",
        action: "EVIDENCE_SUBMITTED",
        objectType: "ScanJob",
        objectId: job.id,
        payload: { findingsAccepted: dto.findings.length },
      });
      return updated;
    });

    // 2. Server-side AI classification (outside transaction, best-effort).
    //    AI failure MUST NOT prevent evidence submission from succeeding.
    //    Credentials stay on the server — the CLI never receives AI_API_KEY.
    let aiClassificationStatus: AiClassificationStatus = "SKIPPED";
    if (dto.requestAiClassification === true) {
      try {
        const aiContext = await classifyFindingsWithAI(dto.findings);
        await prisma.scanJob.update({
          where: { id: job.id },
          data: { aiContext: aiContext as Prisma.InputJsonValue },
        });
        aiClassificationStatus = "COMPLETED";
      } catch (err) {
        logger.warn({ err, scanJobId: job.id }, "ai.classification_failed_evidence_stored");
        aiClassificationStatus = "FAILED";
        // Persist a failure marker so `dpdp status` can surface FAILED (vs never requested).
        await prisma.scanJob
          .update({
            where: { id: job.id },
            data: {
              aiContext: {
                status: "FAILED",
                classifiedAt: new Date().toISOString(),
                provider: "groq",
                model: env.AI_MODEL ?? "unknown",
                error: err instanceof Error
                  ? err.message.replace(/\bAI_API_KEY\b/g, "AI credentials")
                  : "AI classification failed",
                classifications: [],
              } as Prisma.InputJsonValue,
            },
          })
          .catch((persistErr) => {
            logger.warn(
              { err: persistErr, scanJobId: job.id },
              "ai.classification_failure_marker_persist_failed",
            );
          });
      }
    }

    return {
      scanJobId: result.id,
      findingsAccepted: dto.findings.length,
      status: result.status,
      versionNumber: assessment.currentVersion,
      aiClassificationStatus,
    };
  }

  async evaluate(ctx: RequestContext, assessmentId: string) {
    const assessment = await requireAssessment(ctx.organizationId, assessmentId);
    const version = assessment.currentVersion;

    const [findings, answers, documents] = await Promise.all([
      prisma.cliFinding.findMany({
        where: { assessmentId, organizationId: ctx.organizationId, versionNumber: version },
      }),
      prisma.questionnaireAnswer.findMany({
        where: { assessmentId, organizationId: ctx.organizationId, versionNumber: version },
      }),
      prisma.assessmentDocument.findMany({
        where: { assessmentId, organizationId: ctx.organizationId, versionNumber: version },
      }),
    ]);

    const readyDocs = documents.filter((d) => d.uploadStatus === "READY");
    const industry = await organizationIndustry(ctx.organizationId);
    const catalogQuestions = getQuestionsForIndustry(industry);
    const requiredCodes = catalogQuestions
      .filter((q) => q.required !== false)
      .map((q) => q.code);
    // Soft showIf: only require unconditionally visible required questions.
    const answeredCodes = new Set(answers.map((a) => a.questionCode));
    const missingRequired = requiredCodes.filter((code) => {
      const q = catalogQuestions.find((row) => row.code === code);
      if (!q) return false;
      if (q.showIf) {
        const prior = answers.find((a) => a.questionCode === q.showIf!.code);
        const priorVal = prior?.valueJson;
        if (priorVal !== q.showIf.equals) return false;
      }
      return !answeredCodes.has(code);
    });

    if (missingRequired.length > 0) {
      throw new ValidationError(
        `Complete required questionnaire answers before evaluate (missing: ${missingRequired.slice(0, 5).join(", ")}).`,
      );
    }

    const narrativeTexts = answers
      .filter(
        (a) =>
          NARRATIVE_ANSWER_CODES.has(a.questionCode) ||
          (typeof a.valueJson === "string" &&
            String(a.valueJson).trim().length > 40),
      )
      .map((a) => `${a.questionCode}: ${String(a.valueJson)}`);

    const vendors = await prisma.vendor.findMany({
      where: {
        organizationId: ctx.organizationId,
        deletedAt: null,
        status: { in: ["ACTIVE", "DRAFT"] },
      },
      include: {
        agreements: {
          where: {
            status: "ACTIVE",
            deletedAt: null,
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          },
          take: 1,
        },
      },
    });
    const activeVendors = vendors.filter((v) => v.status === "ACTIVE");
    const vendorsMissingDpa = activeVendors.filter(
      (v) => v.agreements.length === 0,
    ).length;

    const evaluated = evaluateControls({
      findings: findings.map((f) => ({
        id: f.id,
        findingType: f.findingType,
        controlCandidates: f.controlCandidates,
        location: f.location,
        confidence: f.confidence,
      })),
      answers: answers.map((a) => ({
        questionCode: a.questionCode,
        valueJson: a.valueJson,
      })),
      documentTexts: [
        ...readyDocs.map((d) => d.extractedText ?? "").filter(Boolean),
        ...narrativeTexts,
      ],
      documentTypes: readyDocs.map((d) => d.documentType),
      vendorLive: {
        liveVendorCount: vendors.length,
        vendorsMissingDpa,
      },
    });

    await prisma.$transaction(async (tx) => {
      for (const r of evaluated.results) {
        const frameworkControlCode = resolveFrameworkCode(r.controlCode);
        await tx.assessmentControlResult.upsert({
          where: {
            assessmentId_versionNumber_controlCode: {
              assessmentId,
              versionNumber: version,
              controlCode: r.controlCode,
            },
          },
          create: {
            assessmentId,
            organizationId: ctx.organizationId,
            versionNumber: version,
            controlCode: r.controlCode,
            frameworkControlCode,
            status: r.status,
            severity: r.severity,
            reasoning: r.reasoning,
            evidenceRefs: r.evidenceRefs as Prisma.InputJsonValue,
          },
          update: {
            frameworkControlCode,
            status: r.status,
            severity: r.severity,
            reasoning: r.reasoning,
            evidenceRefs: r.evidenceRefs as Prisma.InputJsonValue,
          },
        });
      }

      await tx.assessmentReport.upsert({
        where: {
          assessmentId_versionNumber: { assessmentId, versionNumber: version },
        },
        create: {
          assessmentId,
          organizationId: ctx.organizationId,
          versionNumber: version,
          score: evaluated.score,
          summary: evaluated.summary as Prisma.InputJsonValue,
          results: evaluated.results as unknown as Prisma.InputJsonValue,
        },
        update: {
          score: evaluated.score,
          summary: evaluated.summary as Prisma.InputJsonValue,
          results: evaluated.results as unknown as Prisma.InputJsonValue,
        },
      });

      await tx.assessment.update({
        where: { id: assessmentId },
        data: { status: "EVALUATED", updatedBy: ctx.actorUserId },
      });

      await appendAssessmentAudit({
        tx,
        assessmentId,
        organizationId: ctx.organizationId,
        actorType: "USER",
        actorUserId: ctx.actorUserId,
        action: "CONTROLS_EVALUATED",
        objectType: "AssessmentReport",
        objectId: assessmentId,
        payload: {
          score: evaluated.score,
          summary: evaluated.summary,
          version,
          scoreKind: "READINESS",
        },
      });
    });

    // Bridge to ops OS: FAIL → Violation → AUTO remediation task.
    const fails = evaluated.results.filter((r) => r.status === "FAIL");
    const openedViolations: string[] = [];
    for (const fail of fails) {
      const v = await violationService.createFromAssessmentControlFail(ctx, {
        assessmentId,
        assessmentName: assessment.name,
        versionNumber: version,
        controlCode: fail.controlCode,
        severity: fail.severity,
        reasoning: fail.reasoning,
      });
      if (v) openedViolations.push(v.id);
    }

    return {
      score: evaluated.score,
      summary: evaluated.summary,
      results: evaluated.results,
      versionNumber: version,
      scoreKind: "READINESS" as const,
      openedViolations: openedViolations.length,
      nextSteps: {
        remediation: "/remediation",
        violations: "/violations",
        hint: "FAIL controls opened violations with AUTO remediation tasks. Fix, re-scan, create a new version, then re-evaluate.",
      },
    };
  }

  async getReport(ctx: RequestContext, assessmentId: string) {
    const assessment = await requireAssessment(ctx.organizationId, assessmentId);
    const report = await prisma.assessmentReport.findUnique({
      where: {
        assessmentId_versionNumber: {
          assessmentId,
          versionNumber: assessment.currentVersion,
        },
      },
    });
    if (!report) {
      throw new NotFoundError("Report not found. Run controls/evaluate first.");
    }
    return {
      id: report.id,
      version: report.versionNumber,
      score: report.score,
      scoreKind: "READINESS" as const,
      summary: report.summary,
      results: report.results,
      createdAt: report.createdAt,
      disclaimer:
        "Readiness score only — not legal advice or DPDP certification. Improve by closing FAIL violations, adding policy text, and re-scanning via CLI.",
    };
  }

  async createVersion(
    ctx: RequestContext,
    assessmentId: string,
    dto: CreateVersionDto,
  ) {
    const assessment = await requireAssessment(ctx.organizationId, assessmentId);
    const priorVersion = assessment.currentVersion;
    const next = priorVersion + 1;

    const priorReport = await prisma.assessmentReport.findUnique({
      where: {
        assessmentId_versionNumber: {
          assessmentId,
          versionNumber: priorVersion,
        },
      },
    });

    const version = await prisma.$transaction(async (tx) => {
      // Freeze prior readiness pack onto the *new* version row for board trail.
      const created = await tx.assessmentVersion.create({
        data: {
          assessmentId,
          organizationId: ctx.organizationId,
          versionNumber: next,
          label: dto.label ?? `v${next}`,
          readinessScore: priorReport?.score ?? null,
          snapshotJson: priorReport
            ? ({
                frozenFromVersion: priorVersion,
                score: priorReport.score,
                scoreKind: "READINESS",
                summary: priorReport.summary,
                results: priorReport.results,
                frozenAt: new Date().toISOString(),
              } as Prisma.InputJsonValue)
            : undefined,
          createdBy: ctx.actorUserId,
        },
      });
      await tx.assessment.update({
        where: { id: assessmentId },
        data: {
          currentVersion: next,
          status: "IN_PROGRESS",
          updatedBy: ctx.actorUserId,
        },
      });
      await appendAssessmentAudit({
        tx,
        assessmentId,
        organizationId: ctx.organizationId,
        actorType: "USER",
        actorUserId: ctx.actorUserId,
        action: "VERSION_CREATED",
        objectType: "AssessmentVersion",
        objectId: created.id,
        payload: {
          versionNumber: next,
          label: created.label,
          frozenPriorScore: priorReport?.score ?? null,
          frozenFromVersion: priorVersion,
        },
      });
      return created;
    });

    return {
      ...version,
      frozenPriorScore: priorReport?.score ?? null,
      frozenFromVersion: priorVersion,
    };
  }

  async listVersions(ctx: RequestContext, assessmentId: string) {
    await requireAssessment(ctx.organizationId, assessmentId);
    return prisma.assessmentVersion.findMany({
      where: { assessmentId, organizationId: ctx.organizationId },
      orderBy: { versionNumber: "desc" },
      select: {
        id: true,
        versionNumber: true,
        label: true,
        readinessScore: true,
        snapshotJson: true,
        createdAt: true,
      },
    });
  }

  async listAudit(ctx: RequestContext, assessmentId: string) {
    await requireAssessment(ctx.organizationId, assessmentId);
    return prisma.assessmentAuditEvent.findMany({
      where: { assessmentId, organizationId: ctx.organizationId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        action: true,
        actorType: true,
        actorUserId: true,
        objectType: true,
        objectId: true,
        eventHash: true,
        prevEventHash: true,
        createdAt: true,
      },
    });
  }

  async verifyAudit(ctx: RequestContext, assessmentId: string) {
    await requireAssessment(ctx.organizationId, assessmentId);
    const { verifyAssessmentAuditChain } = await import(
      "./assessment-audit.service.js"
    );
    return verifyAssessmentAuditChain({
      assessmentId,
      organizationId: ctx.organizationId,
    });
  }
}

export const assessmentService = new AssessmentService();
