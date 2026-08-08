import type { NextFunction, Response } from "express";
import { sendSuccess } from "../../../shared/middleware/response-envelope.middleware.js";
import {
  getRequestContext,
  type AuthenticatedRequest,
} from "../../../shared/guards/auth.guard.js";
import { ValidationError } from "../../../shared/errors/app-error.js";
import { assessmentService } from "../services/assessment.service.js";
import {
  getCliContext,
  type CliAuthenticatedRequest,
} from "../middleware/authenticate-cli.middleware.js";
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

function param(value: string | string[] | undefined, name: string): string {
  const v = Array.isArray(value) ? value[0] : value;
  if (!v) throw new ValidationError(`Missing path param: ${name}`);
  return v;
}

export class AssessmentController {
  async create(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const data = await assessmentService.create(
        getRequestContext(req),
        req.body as CreateAssessmentDto,
      );
      sendSuccess(res, data, 201);
    } catch (err) {
      next(err);
    }
  }

  async list(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      sendSuccess(res, await assessmentService.list(getRequestContext(req)));
    } catch (err) {
      next(err);
    }
  }

  async questionnaireCatalog(
    _req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ) {
    try {
      sendSuccess(res, assessmentService.getQuestionnaireCatalog());
    } catch (err) {
      next(err);
    }
  }

  async getById(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      sendSuccess(
        res,
        await assessmentService.getById(
          getRequestContext(req),
          param(req.params.id, "id"),
        ),
      );
    } catch (err) {
      next(err);
    }
  }

  async listDocuments(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ) {
    try {
      sendSuccess(
        res,
        await assessmentService.listDocuments(
          getRequestContext(req),
          param(req.params.id, "id"),
        ),
      );
    } catch (err) {
      next(err);
    }
  }

  async listAnswers(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ) {
    try {
      sendSuccess(
        res,
        await assessmentService.listAnswers(
          getRequestContext(req),
          param(req.params.id, "id"),
        ),
      );
    } catch (err) {
      next(err);
    }
  }

  async listScans(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ) {
    try {
      sendSuccess(
        res,
        await assessmentService.listScans(
          getRequestContext(req),
          param(req.params.id, "id"),
        ),
      );
    } catch (err) {
      next(err);
    }
  }

  async uploadDocument(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const data = await assessmentService.uploadDocument(
        getRequestContext(req),
        param(req.params.id, "id"),
        req.body as UploadDocumentDto,
      );
      sendSuccess(res, data, 201);
    } catch (err) {
      next(err);
    }
  }

  async initiateDocument(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const data = await assessmentService.initiateDocumentUpload(
        getRequestContext(req),
        param(req.params.id, "id"),
        req.body as InitiateDocumentDto,
      );
      sendSuccess(res, data, 201);
    } catch (err) {
      next(err);
    }
  }

  async confirmDocument(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const data = await assessmentService.confirmDocumentUpload(
        getRequestContext(req),
        param(req.params.id, "id"),
        param(req.params.documentId, "documentId"),
        req.body as ConfirmDocumentDto,
      );
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  }

  async downloadDocument(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const data = await assessmentService.getDocumentDownloadUrl(
        getRequestContext(req),
        param(req.params.id, "id"),
        param(req.params.documentId, "documentId"),
      );
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  }

  async saveQuestionnaire(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const data = await assessmentService.saveQuestionnaire(
        getRequestContext(req),
        param(req.params.id, "id"),
        req.body as QuestionnaireAnswersDto,
      );
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  }

  async createCliToken(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const data = await assessmentService.createCliToken(
        getRequestContext(req),
        param(req.params.id, "id"),
        req.body as CreateCliTokenDto,
      );
      sendSuccess(res, data, 201);
    } catch (err) {
      next(err);
    }
  }

  async createScan(
    req: CliAuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const data = await assessmentService.createScan(
        getCliContext(req),
        param(req.params.id, "id"),
        req.body as CreateScanDto,
      );
      sendSuccess(res, data, 201);
    } catch (err) {
      next(err);
    }
  }

  async getScan(
    req: CliAuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const data = await assessmentService.getScan(
        getCliContext(req),
        param(req.params.id, "id"),
        param(req.params.scanId, "scanId"),
      );
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  }

  async submitEvidence(
    req: CliAuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const data = await assessmentService.submitEvidenceBatch(
        getCliContext(req),
        param(req.params.id, "id"),
        req.body as EvidenceBatchDto,
      );
      sendSuccess(res, data, 201);
    } catch (err) {
      next(err);
    }
  }

  async evaluate(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const data = await assessmentService.evaluate(
        getRequestContext(req),
        param(req.params.id, "id"),
      );
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  }

  async getReport(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const data = await assessmentService.getReport(
        getRequestContext(req),
        param(req.params.id, "id"),
      );
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  }

  async createVersion(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const data = await assessmentService.createVersion(
        getRequestContext(req),
        param(req.params.id, "id"),
        req.body as CreateVersionDto,
      );
      sendSuccess(res, data, 201);
    } catch (err) {
      next(err);
    }
  }

  async listVersions(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const data = await assessmentService.listVersions(
        getRequestContext(req),
        param(req.params.id, "id"),
      );
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  }

  async listAudit(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const data = await assessmentService.listAudit(
        getRequestContext(req),
        param(req.params.id, "id"),
      );
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  }
}

export const assessmentController = new AssessmentController();
