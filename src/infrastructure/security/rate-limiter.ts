import type { NextFunction, Request, Response } from "express";

/**
 * Placeholder rate limiter — Redis sliding-window lands with auth hardening.
 */
export function rateLimiterMiddleware(
  _req: Request,
  _res: Response,
  next: NextFunction,
): void {
  next();
}
