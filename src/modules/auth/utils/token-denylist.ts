import { getRedis } from "../../../infrastructure/cache/redis-client.js";
import { appConfig } from "../../../config/app.config.js";

const DENY_PREFIX = "auth:deny:jti:";

export async function denyAccessTokenJti(
  jti: string,
  ttlSeconds = appConfig.jwt.accessTtlSeconds,
): Promise<void> {
  const redis = getRedis();
  if (redis.status !== "ready") {
    await redis.connect();
  }
  await redis.set(`${DENY_PREFIX}${jti}`, "1", "EX", Math.max(1, ttlSeconds));
}

export async function isAccessTokenDenied(jti: string): Promise<boolean> {
  const redis = getRedis();
  if (redis.status !== "ready") {
    try {
      await redis.connect();
    } catch {
      return false;
    }
  }
  const value = await redis.get(`${DENY_PREFIX}${jti}`);
  return value === "1";
}
