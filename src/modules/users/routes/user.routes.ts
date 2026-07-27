import { Router } from "express";
import { userController } from "../controllers/user.controller.js";

export function createUsersRouter(): Router {
  const router = Router();
  router.get("/", (req, res, next) => void userController.stub(req, res, next));
  router.post("/", (req, res, next) => void userController.stub(req, res, next));
  router.patch("/:id", (req, res, next) => void userController.stub(req, res, next));
  return router;
}
