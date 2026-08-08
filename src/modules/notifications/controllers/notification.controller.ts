import type { NextFunction, Response } from "express";
import { sendSuccess } from "../../../shared/middleware/response-envelope.middleware.js";
import { getRequestContext, type AuthenticatedRequest } from "../../../shared/guards/auth.guard.js";
import type { ValidatedRequest } from "../../../shared/middleware/validate.middleware.js";
import { notificationService } from "../services/notification.service.js";
import type { ListNotificationsQuery, UpdatePreferencesDto } from "../dto/notification.dto.js";

export class NotificationController {
  async list(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const ctx = getRequestContext(req);
      const query = ((req as ValidatedRequest).validatedQuery ?? {}) as ListNotificationsQuery;
      const result = await notificationService.list(ctx, query);
      sendSuccess(res, result.items, 200, result.meta);
    } catch (err) { next(err); }
  }

  async getUnreadCount(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const ctx = getRequestContext(req);
      const data = await notificationService.getUnreadCount(ctx);
      sendSuccess(res, data);
    } catch (err) { next(err); }
  }

  async markRead(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const ctx = getRequestContext(req);
      const { id } = (req as ValidatedRequest).validatedParams as { id: string };
      const data = await notificationService.markRead(ctx, id);
      sendSuccess(res, data);
    } catch (err) { next(err); }
  }

  async markAllRead(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const ctx = getRequestContext(req);
      const data = await notificationService.markAllRead(ctx);
      sendSuccess(res, data);
    } catch (err) { next(err); }
  }

  async getPreferences(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const ctx = getRequestContext(req);
      sendSuccess(res, await notificationService.getPreferences(ctx));
    } catch (err) { next(err); }
  }

  async updatePreferences(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const ctx = getRequestContext(req);
      const body = (req as ValidatedRequest).validatedBody as UpdatePreferencesDto;
      sendSuccess(res, await notificationService.updatePreferences(ctx, body));
    } catch (err) { next(err); }
  }
}

export const notificationController = new NotificationController();
