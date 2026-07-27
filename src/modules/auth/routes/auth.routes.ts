import { Router } from "express";
import { authenticate } from "../../../shared/middleware/authenticate.middleware.js";
import { validateBody } from "../../../shared/middleware/validate.middleware.js";
import { authController } from "../controllers/auth.controller.js";
import {
  loginDtoSchema,
  logoutDtoSchema,
  refreshDtoSchema,
} from "../dto/auth.dto.js";

export function createAuthRouter(): Router {
  const router = Router();

  router.post(
    "/login",
    validateBody(loginDtoSchema),
    (req, res, next) => void authController.login(req, res, next),
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
