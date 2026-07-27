import { Router } from "express";
import { roleController } from "../controllers/role.controller.js";

export function createRolesRouter(): Router {
  const router = Router();
  router.get("/", (req, res, next) => void roleController.stub(req, res, next));
  router.post("/", (req, res, next) => void roleController.stub(req, res, next));
  router.patch("/:id/permissions", (req, res, next) => void roleController.stub(req, res, next));
  return router;
}
