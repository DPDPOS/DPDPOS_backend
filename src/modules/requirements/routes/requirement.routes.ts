import { Router } from "express";
import { requirementController } from "../controllers/requirement.controller.js";

export function createRequirementsRouter(): Router {
  const router = Router();
  router.get("/", (req, res, next) => void requirementController.stub(req, res, next));
  router.post("/", (req, res, next) => void requirementController.stub(req, res, next));
  return router;
}
