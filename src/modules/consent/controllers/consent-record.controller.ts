import type { NextFunction, Response } from "express";

import { sendSuccess } from "../../../shared/middleware/response-envelope.middleware.js";
import {
  getRequestContext,
  type AuthenticatedRequest,
} from "../../../shared/guards/auth.guard.js";
import type { ValidatedRequest } from "../../../shared/middleware/validate.middleware.js";

import type { CreateConsentRecordDto } from "../dto/consent-record.dto.js";

import { consentRecordService } from "../services/consent-record.service.js";

export class ConsentRecordController {
  async create(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const ctx = getRequestContext(req);
      const body = req.body as CreateConsentRecordDto;

      const record = await consentRecordService.create(ctx, body);

      sendSuccess(res, record, 201);
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
        {}) as {
        dataAssetId?: string;
        noticeId?: string;
        consentState?: "GRANTED" | "WITHDRAWN";
        dataSubjectIdentifier?: string;
      };

      const records = await consentRecordService.list(ctx, query);

      sendSuccess(res, records);
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

      const record = await consentRecordService.getById(ctx, id);

      sendSuccess(res, record);
    } catch (err) {
      next(err);
    }
  }

  async withdraw(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const ctx = getRequestContext(req);

      const { id } = req.params as { id: string };

      const record = await consentRecordService.withdraw(ctx, id);

      sendSuccess(res, record);
    } catch (err) {
      next(err);
    }
  }
}

export const consentRecordController =
  new ConsentRecordController();
