import { Router } from "express";
import { authenticate } from "../../../shared/middleware/authenticate.middleware.js";
import { validateBody } from "../../../shared/middleware/validate.middleware.js";
import { authController } from "../controllers/auth.controller.js";
import {
  acceptInviteDtoSchema,
  loginDtoSchema,
  logoutDtoSchema,
  mfaConfirmDtoSchema,
  mfaResendDtoSchema,
  mfaVerifyDtoSchema,
  refreshDtoSchema,
  registerOrganizationDtoSchema,
  verifyOrgDtoSchema,
} from "../dto/auth.dto.js";

export function createAuthRouter(): Router {
  const router = Router();

  router.post(
    "/register-org",
    validateBody(registerOrganizationDtoSchema),
    (req, res, next) => void authController.registerOrganization(req, res, next),
  );

  router.post(
    "/verify-org",
    validateBody(verifyOrgDtoSchema),
    (req, res, next) => void authController.verifyOrganization(req, res, next),
  );

  router.get(
    "/verify-org",
    (req, res, next) => void authController.verifyOrganization(req, res, next),
  );

  router.post(
    "/login",
    validateBody(loginDtoSchema),
    (req, res, next) => void authController.login(req, res, next),
  );

  router.post(
    "/mfa/verify",
    validateBody(mfaVerifyDtoSchema),
    (req, res, next) => void authController.verifyMfa(req, res, next),
  );

  router.post(
    "/mfa/resend",
    validateBody(mfaResendDtoSchema),
    (req, res, next) => void authController.resendMfa(req, res, next),
  );

  router.post(
    "/accept-invite",
    validateBody(acceptInviteDtoSchema),
    (req, res, next) => void authController.acceptInvite(req, res, next),
  );

  router.post(
    "/mfa/setup",
    authenticate,
    (req, res, next) => void authController.setupMfa(req, res, next),
  );

  router.post(
    "/mfa/confirm",
    authenticate,
    validateBody(mfaConfirmDtoSchema),
    (req, res, next) => void authController.confirmMfa(req, res, next),
  );

  router.post(
    "/refresh",
    validateBody(refreshDtoSchema),
    (req, res, next) => void authController.refresh(req, res, next),
  );

  router.post(
    "/logout",
    validateBody(logoutDtoSchema),
    (req, res, next) => void authController.logout(req, res, next),
  );

  router.get(
    "/me",
    authenticate,
    (req, res, next) => void authController.me(req, res, next),
  );

  return router;
}
