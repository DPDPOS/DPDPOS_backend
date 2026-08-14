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
  apiPublicUrl: env.API_PUBLIC_URL.replace(/\/$/, ""),
  frontendPublicUrl: env.FRONTEND_PUBLIC_URL.replace(/\/$/, ""),
} as const;
