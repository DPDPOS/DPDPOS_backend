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
import { createConsentRouter } from "../modules/consent/routes/consent.routes.js";
import { createDataSubjectRequestRouter } from "../modules/rights/routes/data-subject-request.routes.js";
import { createValidationRouter } from "../modules/validations/routes/validation.routes.js";

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
  app.use(`${v1}/organizations`, createOrganizationsRouter());
  app.use(`${v1}/users`, createUsersRouter());
  app.use(`${v1}/roles`, createRolesRouter());
  app.use(`${v1}/departments`, createDepartmentsRouter());
  app.use(`${v1}/framework`, createFrameworkRouter());
  app.use(`${v1}/controls`, createControlsRouter());
  app.use(`${v1}/requirements`, createRequirementsRouter());
  app.use(`${v1}/data-assets`, createDataAssetRouter());
  app.use(`${v1}/processing-activities`, createProcessingActivityRouter());
  app.use(`${v1}`, createConsentRouter());
  app.use(`${v1}/data-subject-requests`, createDataSubjectRequestRouter());
  app.use(`${v1}`, createValidationRouter());
}
