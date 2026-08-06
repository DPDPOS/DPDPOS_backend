import { Router } from "express";

import { createValidationRuleRouter } from "./validation-rule.routes.js";
import { createValidationRunRouter } from "./validation-run.routes.js";

export function createValidationRouter(): Router {
  const router = Router();

  router.use("/validation-rules", createValidationRuleRouter());
  router.use("/validation-runs", createValidationRunRouter());

  return router;
}
