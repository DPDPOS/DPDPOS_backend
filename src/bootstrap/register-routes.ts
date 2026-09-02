import type { Express, Request, Response, NextFunction } from "express";
import { prisma } from "../infrastructure/database/prisma-client.js";
import { pingRedis } from "../infrastructure/cache/redis-client.js";
import { sendSuccess } from "../shared/middleware/response-envelope.middleware.js";
import { ServiceUnavailableError } from "../shared/errors/app-error.js";
import { createOrganizationsRouter } from "../modules/organizations/routes/organization.routes.js";
import { createUsersRouter } from "../modules/users/routes/user.routes.js";
import { createRolesRouter } from "../modules/roles/routes/role.routes.js";
import { createAuthRouter } from "../modules/auth/routes/auth.routes.js";
import { createDepartmentsRouter } from "../modules/departments/routes/department.routes.js";
import { createFrameworkRouter } from "../modules/framework/routes/framework.routes.js";
import { createControlsRouter } from "../modules/controls/routes/control.routes.js";
import { createRequirementsRouter } from "../modules/requirements/routes/requirement.routes.js";
import { createDataAssetRouter } from "../modules/inventory/routes/data-asset.routes.js";
import { createProcessingActivityRouter } from "../modules/inventory/routes/processing-activity.routes.js";
import { createVendorRouter } from "../modules/vendors/index.js";
import { createConsentRouter } from "../modules/consent/routes/consent.routes.js";
import { createDataSubjectRequestRouter } from "../modules/rights/routes/data-subject-request.routes.js";
import { createSubjectLocatorRouter } from "../modules/rights/services/subject-locator.service.js";
import { createValidationRouter } from "../modules/validations/routes/validation.routes.js";
import { createViolationRouter } from "../modules/violations/routes/violation.routes.js";
import { createRemediationTaskRouter } from "../modules/remediation/routes/remediation-task.routes.js";

// Developer C modules
import { createAuditRouter } from "../modules/audit/index.js";
import { createEvidenceRouter } from "../modules/evidence/index.js";
import { createNotificationRouter } from "../modules/notifications/index.js";
import { createAnalyticsRouter } from "../modules/analytics/index.js";
import { createReportRouter } from "../modules/reports/index.js";
import { createAiRouter } from "../modules/ai/index.js";
import { createAssessmentRouter } from "../modules/assessments/index.js";
import {
  createIdentityAdminRouter,
  createIdentityAuthRouter,
} from "../modules/identity/index.js";
import { createAgentRouter } from "../modules/agents/index.js";
import { createOnboardingRouter } from "../modules/onboarding/index.js";
import { createPluginRouter } from "../modules/plugins/index.js";
import { createLedgerRouter } from "../modules/ledger/index.js";

export function registerRoutes(app: Express): void {
  app.get("/healthz", (_req: Request, res: Response) => {
    sendSuccess(res, { status: "ok" });
  });

  app.get("/readyz", async (_req: Request, res: Response, next: NextFunction) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      const redisOk = await pingRedis();
      if (!redisOk) {
        throw new ServiceUnavailableError("Redis is not ready");
      }
      sendSuccess(res, { status: "ready", database: true, redis: true });
    } catch (err) {
      next(err instanceof ServiceUnavailableError ? err : new ServiceUnavailableError("Dependencies not ready"));
    }
  });

  const v1 = "/api/v1";
  app.use(`${v1}/auth`, createAuthRouter());
  app.use(`${v1}/auth`, createIdentityAuthRouter());
  app.use(`${v1}/identity`, createIdentityAdminRouter());
  app.use(`${v1}/organizations`, createOrganizationsRouter());
  app.use(`${v1}/users`, createUsersRouter());
  app.use(`${v1}/roles`, createRolesRouter());
  app.use(`${v1}/departments`, createDepartmentsRouter());
  app.use(`${v1}/framework`, createFrameworkRouter());
  app.use(`${v1}/controls`, createControlsRouter());
  app.use(`${v1}/requirements`, createRequirementsRouter());
  app.use(`${v1}/data-assets`, createDataAssetRouter());
  app.use(`${v1}/processing-activities`, createProcessingActivityRouter());
  app.use(`${v1}/vendors`, createVendorRouter());
  app.use(`${v1}`, createConsentRouter());
  app.use(`${v1}/data-subject-requests`, createDataSubjectRequestRouter());
  app.use(`${v1}/subject-locator`, createSubjectLocatorRouter());
  app.use(`${v1}`, createValidationRouter());
  app.use(`${v1}/violations`, createViolationRouter());
  app.use(`${v1}/remediation-tasks`, createRemediationTaskRouter());

  // Developer C routes
  app.use(`${v1}/audit`, createAuditRouter());
  app.use(`${v1}/evidence`, createEvidenceRouter());
  app.use(`${v1}/notifications`, createNotificationRouter());
  app.use(`${v1}/analytics`, createAnalyticsRouter());
  app.use(`${v1}/reports`, createReportRouter());
  app.use(`${v1}/ai`, createAiRouter());
  app.use(`${v1}/assessments`, createAssessmentRouter());
  app.use(`${v1}/agents`, createAgentRouter());
  app.use(`${v1}/onboarding`, createOnboardingRouter());
  app.use(`${v1}/plugins`, createPluginRouter());
  app.use(`${v1}/ledger`, createLedgerRouter());
}
