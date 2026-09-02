import { Router } from "express";
import { authenticate } from "../../../shared/middleware/authenticate.middleware.js";
import {
  validateBody,
  validateParams,
} from "../../../shared/middleware/validate.middleware.js";
import { requirePermission } from "../../../shared/guards/permission.guard.js";
import { authenticateCli } from "../middleware/authenticate-cli.middleware.js";
import { assessmentController } from "../controllers/assessment.controller.js";
import { assessmentPermissions } from "../permissions/assessment.permissions.js";
import {
  assessmentIdParamSchema,
  confirmDocumentSchema,
  createAssessmentSchema,
  createCliTokenSchema,
  createScanSchema,
  createVersionSchema,
  documentIdParamSchema,
  evaluateSchema,
  evidenceBatchSchema,
  initiateDocumentSchema,
  questionnaireAnswersSchema,
  scanIdParamSchema,
  uploadDocumentSchema,
} from "../dto/assessment.dto.js";

export function createAssessmentRouter(): Router {
  const router = Router();

  router.post(
    "/",
    authenticate,
    requirePermission(assessmentPermissions.create),
    validateBody(createAssessmentSchema),
    (req, res, next) => void assessmentController.create(req, res, next),
  );

  router.get(
    "/",
    authenticate,
    requirePermission(assessmentPermissions.read),
    (req, res, next) => void assessmentController.list(req, res, next),
  );

  // Static path must be registered before "/:id"
  router.get(
    "/questionnaire/catalog",
    authenticate,
    requirePermission(assessmentPermissions.read),
    (req, res, next) =>
      void assessmentController.questionnaireCatalog(req, res, next),
  );

  router.get(
    "/:id",
    authenticate,
    requirePermission(assessmentPermissions.read),
    validateParams(assessmentIdParamSchema),
    (req, res, next) => void assessmentController.getById(req, res, next),
  );

  router.get(
    "/:id/documents",
    authenticate,
    requirePermission(assessmentPermissions.read),
    validateParams(assessmentIdParamSchema),
    (req, res, next) => void assessmentController.listDocuments(req, res, next),
  );

  router.post(
    "/:id/documents",
    authenticate,
    requirePermission(assessmentPermissions.update),
    validateParams(assessmentIdParamSchema),
    validateBody(uploadDocumentSchema),
    (req, res, next) => void assessmentController.uploadDocument(req, res, next),
  );

  router.post(
    "/:id/documents/initiate",
    authenticate,
    requirePermission(assessmentPermissions.update),
    validateParams(assessmentIdParamSchema),
    validateBody(initiateDocumentSchema),
    (req, res, next) => void assessmentController.initiateDocument(req, res, next),
  );

  router.patch(
    "/:id/documents/:documentId/confirm",
    authenticate,
    requirePermission(assessmentPermissions.update),
    validateParams(documentIdParamSchema),
    validateBody(confirmDocumentSchema),
    (req, res, next) => void assessmentController.confirmDocument(req, res, next),
  );

  router.get(
    "/:id/documents/:documentId/download",
    authenticate,
    requirePermission(assessmentPermissions.read),
    validateParams(documentIdParamSchema),
    (req, res, next) => void assessmentController.downloadDocument(req, res, next),
  );

  router.get(
    "/:id/questionnaire/answers",
    authenticate,
    requirePermission(assessmentPermissions.read),
    validateParams(assessmentIdParamSchema),
    (req, res, next) => void assessmentController.listAnswers(req, res, next),
  );

  router.post(
    "/:id/questionnaire/answers",
    authenticate,
    requirePermission(assessmentPermissions.update),
    validateParams(assessmentIdParamSchema),
    validateBody(questionnaireAnswersSchema),
    (req, res, next) =>
      void assessmentController.saveQuestionnaire(req, res, next),
  );

  // JWT list of scans (FE status) — before CLI-authenticated scan routes
  router.get(
    "/:id/cli/scans",
    authenticate,
    requirePermission(assessmentPermissions.read),
    validateParams(assessmentIdParamSchema),
    (req, res, next) => void assessmentController.listScans(req, res, next),
  );

  router.post(
    "/:id/cli/tokens",
    authenticate,
    requirePermission(assessmentPermissions.cliToken),
    validateParams(assessmentIdParamSchema),
    validateBody(createCliTokenSchema),
    (req, res, next) => void assessmentController.createCliToken(req, res, next),
  );

  // CLI-authenticated routes
  router.post(
    "/:id/cli/scans",
    authenticateCli,
    validateParams(assessmentIdParamSchema),
    validateBody(createScanSchema),
    (req, res, next) => void assessmentController.createScan(req, res, next),
  );

  router.get(
    "/:id/cli/scans/:scanId",
    authenticateCli,
    validateParams(scanIdParamSchema),
    (req, res, next) => void assessmentController.getScan(req, res, next),
  );

  router.post(
    "/:id/cli/evidence/batch",
    authenticateCli,
    validateParams(assessmentIdParamSchema),
    validateBody(evidenceBatchSchema),
    (req, res, next) => void assessmentController.submitEvidence(req, res, next),
  );

  router.post(
    "/:id/controls/evaluate",
    authenticate,
    requirePermission(assessmentPermissions.evaluate),
    validateParams(assessmentIdParamSchema),
    validateBody(evaluateSchema),
    (req, res, next) => void assessmentController.evaluate(req, res, next),
  );

  router.get(
    "/:id/report",
    authenticate,
    requirePermission(assessmentPermissions.read),
    validateParams(assessmentIdParamSchema),
    (req, res, next) => void assessmentController.getReport(req, res, next),
  );

  router.post(
    "/:id/versions",
    authenticate,
    requirePermission(assessmentPermissions.update),
    validateParams(assessmentIdParamSchema),
    validateBody(createVersionSchema),
    (req, res, next) => void assessmentController.createVersion(req, res, next),
  );

  router.get(
    "/:id/versions",
    authenticate,
    requirePermission(assessmentPermissions.read),
    validateParams(assessmentIdParamSchema),
    (req, res, next) => void assessmentController.listVersions(req, res, next),
  );

  router.get(
    "/:id/audit",
    authenticate,
    requirePermission(assessmentPermissions.read),
    validateParams(assessmentIdParamSchema),
    (req, res, next) => void assessmentController.listAudit(req, res, next),
  );

  router.get(
    "/:id/audit/verify",
    authenticate,
    requirePermission(assessmentPermissions.read),
    validateParams(assessmentIdParamSchema),
    (req, res, next) => void assessmentController.verifyAudit(req, res, next),
  );

  return router;
}
