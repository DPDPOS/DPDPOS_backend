import { Router } from "express";
import { frameworkController } from "../controllers/framework.controller.js";

export function createFrameworkRouter(): Router {
  const router = Router();
  router.post("/generate", (req, res, next) => void frameworkController.stub(req, res, next));
  router.get("/roadmap", (req, res, next) => void frameworkController.stub(req, res, next));
  return router;
}
