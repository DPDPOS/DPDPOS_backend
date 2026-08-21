import { UnrecoverableError } from "bullmq";
import { AppError } from "../../shared/errors/app-error.js";

type SmtpLikeError = Error & {
  code?: string | number;
  responseCode?: number;
  command?: string;
  response?: string;
};

const transientNetworkCodes = new Set([
  "ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "ESOCKETTIMEDOUT",
  "EHOSTUNREACH", "ENETUNREACH", "EAI_AGAIN", "ENOTFOUND",
]);
const permanentCodes = new Set(["EAUTH", "EENVELOPE", "EINVALID", "ECONFIG"]);

/** Converts only clearly non-retryable provider failures to BullMQ's terminal error. */
export function classifyEmailDeliveryError(error: unknown): Error {
  if (error instanceof UnrecoverableError) return error;
  if (error instanceof AppError) return new UnrecoverableError(error.message);
  const smtp = error as SmtpLikeError;
  const code = String(smtp?.code ?? "").toUpperCase();
  const responseCode = smtp?.responseCode ?? (typeof smtp?.code === "number" ? smtp.code : undefined);
  const response = `${smtp?.response ?? ""} ${smtp?.message ?? ""}`.toLowerCase();

  if (transientNetworkCodes.has(code) || responseCode === 421 || (responseCode !== undefined && responseCode >= 450 && responseCode < 500) || response.includes("throttl")) {
    return error instanceof Error ? error : new Error("Transient email provider failure");
  }
  if (permanentCodes.has(code) || (responseCode !== undefined && responseCode >= 500 && responseCode < 600)) {
    return new UnrecoverableError("Permanent email provider failure");
  }
  // Unknown errors remain retryable: delivery is preferable to silently losing an MFA email.
  return error instanceof Error ? error : new Error("Unknown email provider failure");
}
