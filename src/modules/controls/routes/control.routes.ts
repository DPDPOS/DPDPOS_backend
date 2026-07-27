import { Router } from "express";
import { controlController } from "../controllers/control.controller.js";

export function createControlsRouter(): Router {
  const router = Router();
  router.get("/", (req, res, next) => void controlController.stub(req, res, next));
  router.post("/", (req, res, next) => void controlController.stub(req, res, next));
  router.patch("/:id", (req, res, next) => void controlController.stub(req, res, next));
  return router;
}
