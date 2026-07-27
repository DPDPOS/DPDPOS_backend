import Redis from "ioredis";
import { redisConfig } from "../../config/redis.config.js";
import { logger } from "../logging/logger.js";

let redis: Redis | null = null;

export function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(redisConfig.url, {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      lazyConnect: true,
    });

    redis.on("error", (err) => {
      logger.error({ err }, "redis.error");
    });
  }

  return redis;
}

export async function connectRedis(): Promise<void> {
  const client = getRedis();
  if (client.status === "wait" || client.status === "end") {
    await client.connect();
  }
  logger.info("redis.connected");
}

export async function disconnectRedis(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
    logger.info("redis.disconnected");
  }
}

export async function pingRedis(): Promise<boolean> {
  try {
    const client = getRedis();
    if (client.status !== "ready") {
      await connectRedis();
    }
    const result = await client.ping();
    return result === "PONG";
  } catch {
    return false;
  }
}
