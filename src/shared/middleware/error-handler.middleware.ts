import type { NextFunction, Request, Response } from "express";
import { appConfig } from "../../config/app.config.js";
import { logger } from "../../infrastructure/logging/logger.js";
import { AppError } from "../errors/app-error.js";
import { toErrorEnvelope } from "../errors/error-map.js";

export function errorHandlerMiddleware(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const mapped = toErrorEnvelope(err);
  const correlationId = (req as Request & { correlationId?: string }).correlationId;

  if (err instanceof AppError && err.isOperational) {
    logger.warn(
      { err, correlationId, code: err.code },
      "http.operational_error",
    );
  } else {
    logger.error({ err, correlationId }, "http.unexpected_error");
  }

  if (!appConfig.isProd && err instanceof Error && !(err instanceof AppError)) {
    mapped.body.error.message = err.message;
  }

  res.status(mapped.statusCode).json(mapped.body);
}
