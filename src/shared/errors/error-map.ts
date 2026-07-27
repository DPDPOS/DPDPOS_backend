import { AppError } from "./app-error.js";

export function toErrorEnvelope(error: unknown): {
  statusCode: number;
  body: {
    success: false;
    error: { code: string; message: string; details?: unknown };
  };
} {
  if (error instanceof AppError) {
    return {
      statusCode: error.statusCode,
      body: {
        success: false,
        error: {
          code: error.code,
          message: error.message,
          ...(error.details !== undefined ? { details: error.details } : {}),
        },
      },
    };
  }

  return {
    statusCode: 500,
    body: {
      success: false,
      error: {
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred",
      },
    },
  };
}
