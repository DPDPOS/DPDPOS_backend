import { env } from "./env.js";

export const redisConfig = {
  url: env.REDIS_URL,
} as const;
