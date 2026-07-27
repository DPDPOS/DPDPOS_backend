import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

export type RequestStore = {
  correlationId: string;
};

export const requestContextStorage = new AsyncLocalStorage<RequestStore>();

export function correlationIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const incoming = req.header("x-correlation-id");
  const correlationId =
    incoming && incoming.trim().length > 0 ? incoming.trim() : randomUUID();

  res.setHeader("x-correlation-id", correlationId);
  (req as Request & { correlationId?: string }).correlationId = correlationId;

  requestContextStorage.run({ correlationId }, () => next());
}

export function getCorrelationId(): string | undefined {
  return requestContextStorage.getStore()?.correlationId;
}
