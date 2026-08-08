import path from "node:path";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { rateLimiterMiddleware } from "./infrastructure/security/rate-limiter.js";
import { correlationIdMiddleware } from "./shared/middleware/correlation-id.middleware.js";
import { errorHandlerMiddleware } from "./shared/middleware/error-handler.middleware.js";
import { requestLoggerMiddleware } from "./shared/middleware/request-logger.middleware.js";
import { registerRoutes } from "./bootstrap/register-routes.js";
import { NotFoundError } from "./shared/errors/app-error.js";

const publicDir = path.resolve(process.cwd(), "public");

export function createApp() {
  const app = express();

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "https://fonts.googleapis.com"],
          fontSrc: ["'self'", "https://fonts.gstatic.com"],
          imgSrc: ["'self'", "data:"],
          connectSrc: ["'self'"],
        },
      },
    }),
  );
  app.use(cors());
  app.use(express.json({ limit: "2mb" }));
  app.use(correlationIdMiddleware);
  app.use(requestLoggerMiddleware);
  app.use(rateLimiterMiddleware);

  registerRoutes(app);

  app.use("/demo", express.static(path.join(publicDir, "demo")));
  app.get("/demo", (_req, res) => {
    res.sendFile(path.join(publicDir, "demo", "index.html"));
  });

  app.use((req, _res, next) => {
    next(new NotFoundError(`Route not found: ${req.method} ${req.path}`));
  });

  app.use(errorHandlerMiddleware);

  return app;
}
