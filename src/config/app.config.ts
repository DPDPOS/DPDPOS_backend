import { env } from "./env.js";

export const appConfig = {
  env: env.NODE_ENV,
  port: env.PORT,
  logLevel: env.LOG_LEVEL,
  isProd: env.NODE_ENV === "production",
  jwt: {
    accessSecret: env.JWT_ACCESS_SECRET,
    refreshSecret: env.JWT_REFRESH_SECRET,
    accessTtlSeconds: env.JWT_ACCESS_TTL_SECONDS,
    refreshTtlSeconds: env.JWT_REFRESH_TTL_SECONDS,
  },
  outboxPollIntervalMs: env.OUTBOX_POLL_INTERVAL_MS,
  email: {
    provider: env.EMAIL_PROVIDER ?? (env.NODE_ENV === "production" ? "SES_SMTP" : "MAILHOG"),
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    user: env.SMTP_USER,
    password: env.SMTP_PASSWORD,
    from: env.SMTP_FROM,
    requireAuth: env.SMTP_REQUIRE_AUTH,
    workerConcurrency: env.EMAIL_WORKER_CONCURRENCY,
  },
  apiPublicUrl: env.API_PUBLIC_URL.replace(/\/$/, ""),
  frontendPublicUrl: env.FRONTEND_PUBLIC_URL.replace(/\/$/, ""),
} as const;
