import cors from "cors";
import express from "express";
import helmet from "helmet";
import { rateLimiterMiddleware } from "./infrastructure/security/rate-limiter.js";
import { correlationIdMiddleware } from "./shared/middleware/correlation-id.middleware.js";
import { errorHandlerMiddleware } from "./shared/middleware/error-handler.middleware.js";
import { requestLoggerMiddleware } from "./shared/middleware/request-logger.middleware.js";
import { registerRoutes } from "./bootstrap/register-routes.js";

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: "2mb" }));
  app.use(correlationIdMiddleware);
  app.use(requestLoggerMiddleware);
  app.use(rateLimiterMiddleware);

  registerRoutes(app);

  app.use(errorHandlerMiddleware);

  return app;
}
