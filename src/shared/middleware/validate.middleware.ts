import type { NextFunction, Request, Response } from "express";
import type { ZodType } from "zod";
import { ValidationError } from "../errors/app-error.js";

type RequestTarget = "body" | "params" | "query";

export type ValidatedRequest = Request & {
  validatedQuery?: unknown;
  validatedParams?: unknown;
};

function validate(schema: ZodType, target: RequestTarget) {
  return (req: ValidatedRequest, _res: Response, next: NextFunction): void => {
    const parsed = schema.safeParse(req[target]);
    if (!parsed.success) {
      next(new ValidationError("Validation failed", parsed.error.flatten()));
      return;
    }

    // Express 5: req.query is a getter-only property — do not assign to it.
    if (target === "query") {
      req.validatedQuery = parsed.data;
    } else if (target === "params") {
      req.validatedParams = parsed.data;
      Object.assign(req.params, parsed.data as object);
    } else {
      req.body = parsed.data;
    }
    next();
  };
}

export function validateBody<T extends ZodType>(schema: T) {
  return validate(schema, "body");
}

export function validateParams<T extends ZodType>(schema: T) {
  return validate(schema, "params");
}

export function validateQuery<T extends ZodType>(schema: T) {
  return validate(schema, "query");
}
