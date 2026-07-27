import { Router } from "express";
import { departmentController } from "../controllers/department.controller.js";

export function createDepartmentsRouter(): Router {
  const router = Router();
  router.get("/", (req, res, next) => void departmentController.stub(req, res, next));
  router.post("/", (req, res, next) => void departmentController.stub(req, res, next));
  return router;
}
