import type { NextFunction, Response } from "express";

import { sendSuccess } from "../../../shared/middleware/response-envelope.middleware.js";
import {
  getRequestContext,
  type AuthenticatedRequest,
} from "../../../shared/guards/auth.guard.js";
import type { ValidatedRequest } from "../../../shared/middleware/validate.middleware.js";

import type {
  CreateDataSubjectRequestDto,
  ListDataSubjectRequestsQuery,
  UpdateDataSubjectRequestDto,
} from "../dto/data-subject-request.dto.js";

import { dataSubjectRequestService } from "../services/data-subject-request.service.js";
import { erasureEvidenceService } from "../services/erasure-evidence.service.js";
import { dsrSagaService } from "../../../control-plane/dsr-saga.service.js";

export class DataSubjectRequestController {
  async submit(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const ctx = getRequestContext(req);
      const body = req.body as CreateDataSubjectRequestDto;

      const request = await dataSubjectRequestService.submit(ctx, body);

      if (body.requestType === "ERASURE" && !request.deduped) {
        await erasureEvidenceService.startErasure(ctx, request.id, {
          immediate: body.immediateErase,
          coolingOffDays: body.coolingOffDays,
        });
      }

      sendSuccess(res, request, request.deduped ? 200 : 201);
    } catch (err) {
      next(err);
    }
  }

  async list(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const ctx = getRequestContext(req);
      const query = ((req as ValidatedRequest).validatedQuery ??
        {}) as ListDataSubjectRequestsQuery;

      const requests = await dataSubjectRequestService.list(ctx, query);

      sendSuccess(res, requests);
    } catch (err) {
      next(err);
    }
  }

  async getById(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const ctx = getRequestContext(req);

      const { id } = req.params as { id: string };

      const request = await dataSubjectRequestService.getById(ctx, id);

      sendSuccess(res, request);
    } catch (err) {
      next(err);
    }
  }

  async update(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const ctx = getRequestContext(req);

      const { id } = req.params as { id: string };
      const body = req.body as UpdateDataSubjectRequestDto;

      const request = await dataSubjectRequestService.update(ctx, id, body);

      sendSuccess(res, request);
    } catch (err) {
      next(err);
    }
  }

  async startErasure(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const ctx = getRequestContext(req);
      const { id } = req.params as { id: string };
      const body = req.body as { immediate?: boolean; coolingOffDays?: number };
      const pack = await erasureEvidenceService.startErasure(ctx, id, body);
      sendSuccess(res, pack);
    } catch (err) {
      next(err);
    }
  }

  async getErasure(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const ctx = getRequestContext(req);
      const { id } = req.params as { id: string };
      const pack = await erasureEvidenceService.getErasurePack(ctx, id);
      sendSuccess(res, pack);
    } catch (err) {
      next(err);
    }
  }

  async confirmErasureItem(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const ctx = getRequestContext(req);
      const { id } = req.params as { id: string };
      const body = req.body as {
        systemKey: string;
        status: "DONE" | "SKIPPED" | "FAILED";
        notes?: string;
      };
      const item = await erasureEvidenceService.confirmChecklistItem(
        ctx,
        id,
        body,
      );
      sendSuccess(res, item);
    } catch (err) {
      next(err);
    }
  }

  async completeErasure(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const ctx = getRequestContext(req);
      const { id } = req.params as { id: string };
      const evidence = await erasureEvidenceService.completeHardErase(ctx, id);
      sendSuccess(res, evidence);
    } catch (err) {
      next(err);
    }
  }

  async dispatchErasureAgents(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const ctx = getRequestContext(req);
      const result = await dsrSagaService.startAgentErasure(
        ctx,
        req.params.id as string,
      );
      sendSuccess(res, result, 202);
    } catch (err) {
      next(err);
    }
  }

  async getErasureSagaStatus(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const ctx = getRequestContext(req);
      sendSuccess(
        res,
        await dsrSagaService.getSagaStatus(ctx, req.params.id as string),
      );
    } catch (err) {
      next(err);
    }
  }
}

export const dataSubjectRequestController =
  new DataSubjectRequestController();
