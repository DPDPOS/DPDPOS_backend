import type { NextFunction, Response } from "express";
import type { AuthenticatedRequest } from "../../../shared/types/authenticated-request.js";
import { sendSuccess } from "../../../shared/middleware/response-envelope.middleware.js";
import type { OnboardingIntakeDto } from "../dto/onboarding.dto.js";
import { onboardingService } from "../services/onboarding.service.js";

export class OnboardingController {
  async intake(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      sendSuccess(
        res,
        await onboardingService.intake(
          req.context!,
          req.body as OnboardingIntakeDto,
        ),
        201,
      );
    } catch (error) {
      next(error);
    }
  }
}

export const onboardingController = new OnboardingController();
