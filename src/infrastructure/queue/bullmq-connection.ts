import { redisConfig } from "../../config/redis.config.js";

/**
 * BullMQ expects discrete ioredis options (not a URL string).
 * Upstash and other managed Redis use `rediss://` — without `tls: {}`,
 * Queue/Worker commands hang indefinitely after a plaintext connect attempt.
 */
export function createBullMqConnectionOptions() {
  const url = new URL(redisConfig.url);
  const useTls = url.protocol === "rediss:";

  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    password: url.password ? decodeURIComponent(url.password) : undefined,
    username: url.username ? decodeURIComponent(url.username) : undefined,
    maxRetriesPerRequest: null as null,
    enableReadyCheck: false,
    ...(useTls ? { tls: {} } : {}),
  };
}
