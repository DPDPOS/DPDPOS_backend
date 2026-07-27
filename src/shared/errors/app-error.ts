export type AppErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR"
  | "SERVICE_UNAVAILABLE";

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly statusCode: number;
  readonly details?: unknown;
  readonly isOperational: boolean;

  constructor(params: {
    code: AppErrorCode;
    message: string;
    statusCode: number;
    details?: unknown;
    isOperational?: boolean;
  }) {
    super(params.message);
    this.name = "AppError";
    this.code = params.code;
    this.statusCode = params.statusCode;
    this.details = params.details;
    this.isOperational = params.isOperational ?? true;
  }
}

export class ValidationError extends AppError {
  constructor(message = "Validation failed", details?: unknown) {
    super({
      code: "VALIDATION_ERROR",
      message,
      statusCode: 400,
      details,
    });
    this.name = "ValidationError";
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized") {
    super({ code: "UNAUTHORIZED", message, statusCode: 401 });
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Forbidden") {
    super({ code: "FORBIDDEN", message, statusCode: 403 });
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Resource not found") {
    super({ code: "NOT_FOUND", message, statusCode: 404 });
    this.name = "NotFoundError";
  }
}

export class ConflictError extends AppError {
  constructor(message = "Conflict") {
    super({ code: "CONFLICT", message, statusCode: 409 });
    this.name = "ConflictError";
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message = "Service unavailable") {
    super({ code: "SERVICE_UNAVAILABLE", message, statusCode: 503 });
    this.name = "ServiceUnavailableError";
  }
}
