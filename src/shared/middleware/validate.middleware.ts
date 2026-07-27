import type { NextFunction, Request, Response } from "express";
import type { ZodType } from "zod";
import { ValidationError } from "../errors/app-error.js";

type RequestTarget = "body" | "params" | "query";

function validate(schema: ZodType, target: RequestTarget) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const parsed = schema.safeParse(req[target]);
    if (!parsed.success) {
      next(
        new ValidationError("Validation failed", parsed.error.flatten()),
      );
      return;
    }
    (req as Request & Record<string, unknown>)[target] = parsed.data;
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
