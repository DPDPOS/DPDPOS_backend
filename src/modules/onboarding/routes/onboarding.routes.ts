import { Router } from "express";
import { authenticate } from "../../../shared/middleware/authenticate.middleware.js";
import { requirePermission } from "../../../shared/guards/permission.guard.js";
import { validateBody } from "../../../shared/middleware/validate.middleware.js";
import { onboardingController } from "../controllers/onboarding.controller.js";
import { onboardingIntakeSchema } from "../dto/onboarding.dto.js";
import { onboardingPermissions } from "../permissions/onboarding.permissions.js";

export function createOnboardingRouter(): Router {
  const router = Router();

  const handleIntake = (req: any, res: any, next: any) =>
    void onboardingController.intake(req, res, next);

  router.post(
    "/",
    authenticate,
    requirePermission(onboardingPermissions.manage),
    validateBody(onboardingIntakeSchema),
    handleIntake,
  );
  router.post(
    "/intake",
    authenticate,
    requirePermission(onboardingPermissions.manage),
    validateBody(onboardingIntakeSchema),
    handleIntake,
  );
  return router;
}
