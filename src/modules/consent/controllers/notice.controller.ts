import type { NextFunction, Response } from "express";

import { sendSuccess } from "../../../shared/middleware/response-envelope.middleware.js";
import {
  getRequestContext,
  type AuthenticatedRequest,
} from "../../../shared/guards/auth.guard.js";

import type { CreateNoticeDto } from "../dto/notice.dto.js";

import { noticeService } from "../services/notice.service.js";

export class NoticeController {
  async create(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const ctx = getRequestContext(req);
      const body = req.body as CreateNoticeDto;

      const notice = await noticeService.create(ctx, body);

      sendSuccess(res, notice, 201);
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

      const notices = await noticeService.list(ctx);

      sendSuccess(res, notices);
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

      const notice = await noticeService.getById(ctx, id);

      sendSuccess(res, notice);
    } catch (err) {
      next(err);
    }
  }

  async softDelete(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const ctx = getRequestContext(req);

      const { id } = req.params as { id: string };

      const notice = await noticeService.softDelete(ctx, id);

      sendSuccess(res, notice);
    } catch (err) {
      next(err);
    }
  }

  async diff(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const ctx = getRequestContext(req);
      const { id } = req.params as { id: string };
      const againstVersion = Number(
        (req.query as { againstVersion?: string }).againstVersion,
      );
      const diff = await noticeService.diff(ctx, id, againstVersion);
      sendSuccess(res, diff);
    } catch (err) {
      next(err);
    }
  }
}

export const noticeController = new NoticeController();
