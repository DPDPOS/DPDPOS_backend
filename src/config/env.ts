import { z } from "zod";
import "dotenv/config";

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
});

export type Env = z.infer<typeof envSchema>;

export const env: Env = envSchema.parse(process.env);
