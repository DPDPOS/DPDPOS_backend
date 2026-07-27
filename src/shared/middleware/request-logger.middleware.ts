import type { NextFunction, Request, Response } from "express";
import { logger } from "../../infrastructure/logging/logger.js";

export function requestLoggerMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const started = Date.now();

  res.on("finish", () => {
    logger.info(
      {
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
        durationMs: Date.now() - started,
        correlationId: (req as Request & { correlationId?: string }).correlationId,
      },
      "http.request",
    );
  });

  next();
}
