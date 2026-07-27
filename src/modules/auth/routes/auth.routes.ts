import { Router } from "express";
import { authController } from "../controllers/auth.controller.js";

export function createAuthRouter(): Router {
  const router = Router();
  router.post("/login", (req, res, next) => void authController.stub(req, res, next));
  router.post("/logout", (req, res, next) => void authController.stub(req, res, next));
  router.post("/refresh", (req, res, next) => void authController.stub(req, res, next));
  router.get("/me", (req, res, next) => void authController.stub(req, res, next));
  return router;
}
