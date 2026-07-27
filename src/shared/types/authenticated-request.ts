import type { Request } from "express";
import type { RequestContext } from "./request-context.js";

export type AuthenticatedRequest = Request & {
  context?: RequestContext;
  correlationId?: string;
};
