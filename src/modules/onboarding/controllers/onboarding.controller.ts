import type { NextFunction, Response } from "express";
import { sendSuccess } from "../../../shared/middleware/response-envelope.middleware.js";
import {
  getRequestContext,
  type AuthenticatedRequest,
} from "../../../shared/guards/auth.guard.js";
import type {
  OnboardingProfileDto,
  SaveOnboardingAnswersDto,
} from "../dto/onboarding.dto.js";
import { onboardingService } from "../services/onboarding.service.js";

export class OnboardingController {
  async status(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const ctx = getRequestContext(req);
      const data = await onboardingService.getStatus(ctx);
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  }

  async catalog(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const ctx = getRequestContext(req);
      const data = await onboardingService.getCatalog(ctx);
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  }

  async updateProfile(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const ctx = getRequestContext(req);
      const data = await onboardingService.updateProfile(
        ctx,
        req.body as OnboardingProfileDto,
      );
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  }

  async saveAnswers(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const ctx = getRequestContext(req);
      const data = await onboardingService.saveAnswers(
        ctx,
        req.body as SaveOnboardingAnswersDto,
      );
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  }

  async downloadTemplate(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const { buffer, fileName } =
        await onboardingService.downloadQuestionnaireTemplate(
          getRequestContext(req),
        );
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${fileName}"`,
      );
      res.status(200).send(buffer);
    } catch (err) {
      next(err);
    }
  }

  async importExcel(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const body = req.body as { contentBase64: string };
      sendSuccess(
        res,
        await onboardingService.importQuestionnaireExcel(
          getRequestContext(req),
          body.contentBase64,
        ),
      );
    } catch (err) {
      next(err);
    }
  }

  async complete(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const ctx = getRequestContext(req);
      const data = await onboardingService.complete(ctx);
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  }
}

export const onboardingController = new OnboardingController();
