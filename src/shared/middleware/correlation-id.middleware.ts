import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

export type RequestStore = {
  correlationId: string;
  ipAddress?: string;
  userAgent?: string;
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

  const forwarded = req.headers["x-forwarded-for"];
  const forwardedIp =
    typeof forwarded === "string"
      ? forwarded.split(",")[0]?.trim()
      : Array.isArray(forwarded)
        ? forwarded[0]
        : undefined;

  requestContextStorage.run(
    {
      correlationId,
      ipAddress: forwardedIp || req.ip || undefined,
      userAgent:
        typeof req.headers["user-agent"] === "string"
          ? req.headers["user-agent"]
          : undefined,
    },
    () => next(),
  );
}

export function getCorrelationId(): string | undefined {
  return requestContextStorage.getStore()?.correlationId;
}

export function getRequestClientMeta(): {
  ipAddress?: string;
  userAgent?: string;
} {
  const store = requestContextStorage.getStore();
  if (!store) return {};
  return {
    ...(store.ipAddress ? { ipAddress: store.ipAddress } : {}),
    ...(store.userAgent ? { userAgent: store.userAgent } : {}),
  };
}
