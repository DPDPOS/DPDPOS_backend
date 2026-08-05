import { Router } from "express";

import { createNoticeRouter } from "./notice.routes.js";
import { createConsentRecordRouter } from "./consent-record.routes.js";

export function createConsentRouter(): Router {
  const router = Router();

  router.use("/notices", createNoticeRouter());
  router.use("/consent-records", createConsentRecordRouter());

  return router;
}
