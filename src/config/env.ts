import { z } from "zod";
import "dotenv/config";

const optionalNonEmptyString = z
  .string()
  .optional()
  .transform((value) => value || undefined);

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  JWT_REFRESH_TTL_SECONDS: z.coerce.number().int().positive().default(604800),
  S3_ENDPOINT: z.string().url(),
  S3_REGION: z.string().min(1),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  S3_FORCE_PATH_STYLE: z
    .string()
    .optional()
    .transform((v) => v !== "false"),
  OUTBOX_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(2000),
  AI_API_KEY: z.string().optional(),
  AI_BASE_URL: z
    .union([z.string().url(), z.literal("")])
    .optional()
    .transform((value) => value || undefined),
  AI_MODEL: z.string().optional(),
  AI_MAX_TOKENS: z.coerce.number().int().positive().default(1024),
  // Critical transactional email delivery (MailHog locally, SES SMTP in production).
  EMAIL_PROVIDER: z.enum(["MAILHOG", "SES_SMTP"]).optional(),
  SMTP_HOST: optionalNonEmptyString,
  SMTP_PORT: z.coerce.number().int().positive().max(65535).default(587),
  SMTP_SECURE: z
    .string()
    .optional()
    .transform((value) => value === "true"),
  SMTP_USER: optionalNonEmptyString,
  SMTP_PASSWORD: optionalNonEmptyString,
  SMTP_FROM: optionalNonEmptyString,
  SMTP_REQUIRE_AUTH: z
    .string()
    .optional()
    .transform((value) => value !== "false"),
  EMAIL_WORKER_CONCURRENCY: z.coerce.number().int().positive().max(100).default(10),
  EMAIL_RATE_LIMIT_MAX: z.coerce.number().int().positive().max(10_000).default(10),
  EMAIL_RATE_LIMIT_DURATION_MS: z.coerce.number().int().positive().max(3_600_000).default(1_000),
  // Use localhost (not 127.0.0.1): Entra only allows http://localhost redirect URIs.
  API_PUBLIC_URL: z.string().url().default("http://localhost:3000"),
  FRONTEND_PUBLIC_URL: z.string().url().default("http://localhost:3001"),
}).superRefine((value, ctx) => {
  const provider = value.EMAIL_PROVIDER ?? (value.NODE_ENV === "production" ? "SES_SMTP" : "MAILHOG");
  if (value.NODE_ENV === "production" && provider !== "SES_SMTP") {
    ctx.addIssue({ code: "custom", path: ["EMAIL_PROVIDER"], message: "Production email delivery must use SES_SMTP" });
  }
  if (value.NODE_ENV === "production" && (!value.SMTP_REQUIRE_AUTH || !value.SMTP_HOST || !value.SMTP_FROM || !value.SMTP_USER || !value.SMTP_PASSWORD)) {
    ctx.addIssue({ code: "custom", path: ["SMTP_HOST"], message: "SES SMTP host, user, password, and from address are required in production" });
  }
});

export type Env = z.infer<typeof envSchema>;

export const env: Env = envSchema.parse(process.env);
