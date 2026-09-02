import { Router } from "express";
import { authenticate } from "../../../shared/middleware/authenticate.middleware.js";
import { validateBody } from "../../../shared/middleware/validate.middleware.js";
import { requirePermission } from "../../../shared/guards/permission.guard.js";
import { onboardingController } from "../controllers/onboarding.controller.js";
import { onboardingPermissions } from "../permissions/onboarding.permissions.js";
import {
  importOnboardingExcelSchema,
  onboardingProfileDtoSchema,
  saveOnboardingAnswersDtoSchema,
} from "../dto/onboarding.dto.js";

export function createOnboardingRouter(): Router {
  const router = Router();

  router.get(
    "/status",
    authenticate,
    requirePermission(onboardingPermissions.read),
    (req, res, next) => void onboardingController.status(req, res, next),
  );

  router.get(
    "/questionnaire",
    authenticate,
    requirePermission(onboardingPermissions.read),
    (req, res, next) => void onboardingController.catalog(req, res, next),
  );

  router.get(
    "/questionnaire/template.xlsx",
    authenticate,
    requirePermission(onboardingPermissions.read),
    (req, res, next) => void onboardingController.downloadTemplate(req, res, next),
  );

  router.post(
    "/questionnaire/import",
    authenticate,
    requirePermission(onboardingPermissions.manage),
    validateBody(importOnboardingExcelSchema),
    (req, res, next) => void onboardingController.importExcel(req, res, next),
  );

  router.patch(
    "/profile",
    authenticate,
    requirePermission(onboardingPermissions.manage),
    validateBody(onboardingProfileDtoSchema),
    (req, res, next) => void onboardingController.updateProfile(req, res, next),
  );

  router.put(
    "/answers",
    authenticate,
    requirePermission(onboardingPermissions.manage),
    validateBody(saveOnboardingAnswersDtoSchema),
    (req, res, next) => void onboardingController.saveAnswers(req, res, next),
  );

  router.post(
    "/complete",
    authenticate,
    requirePermission(onboardingPermissions.manage),
    (req, res, next) => void onboardingController.complete(req, res, next),
  );

  return router;
}
