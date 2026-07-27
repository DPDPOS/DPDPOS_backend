import { Router } from "express";
import { organizationController } from "../controllers/organization.controller.js";

export function createOrganizationsRouter(): Router {
  const router = Router();
  router.post("/", (req, res, next) => void organizationController.stub(req, res, next));
  router.get("/:id", (req, res, next) => void organizationController.stub(req, res, next));
  router.patch("/:id", (req, res, next) => void organizationController.stub(req, res, next));
  return router;
}
