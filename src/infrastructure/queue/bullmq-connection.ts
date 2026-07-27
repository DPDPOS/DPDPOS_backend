import { redisConfig } from "../../config/redis.config.js";

export function createBullMqConnectionOptions() {
  const url = new URL(redisConfig.url);
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    password: url.password || undefined,
    username: url.username || undefined,
    maxRetriesPerRequest: null as null,
  };
}
