import { env } from "../../config/env.js";
import { logger } from "../logging/logger.js";
import { connectRedis, getRedis } from "./redis-client.js";

export type ConsentInvalidation = {
  organizationId: string;
  userId: string;
  purpose: string;
  invalidatedAt: string;
};

export const consentInvalidationQueueKey = (organizationId: string): string =>
  `consent:invalidate:queue:${organizationId}`;

export async function publishConsentInvalidation(
  organizationId: string,
  userId: string,
  purpose: string,
): Promise<void> {
  const payload: ConsentInvalidation = {
    organizationId,
    userId,
    purpose,
    invalidatedAt: new Date().toISOString(),
  };

  try {
    const redis = getRedis();
    if (redis.status !== "ready") await connectRedis();
    const encoded = JSON.stringify(payload);
    await redis
      .multi()
      .publish(env.CONSENT_INVALIDATION_CHANNEL, encoded)
      .lpush(consentInvalidationQueueKey(organizationId), encoded)
      .ltrim(consentInvalidationQueueKey(organizationId), 0, 999)
      .exec();
  } catch (error) {
    // Withdrawal is already durable at this point; invalidation delivery is
    // best-effort and the outbox event remains the recovery source.
    logger.error({ error, organizationId }, "consent.invalidation_publish_failed");
  }
}

export async function popConsentInvalidations(
  organizationId: string,
  limit = 25,
): Promise<ConsentInvalidation[]> {
  try {
    const redis = getRedis();
    if (redis.status !== "ready") await connectRedis();
    const values: ConsentInvalidation[] = [];
    for (let index = 0; index < limit; index += 1) {
      const encoded = await redis.rpop(consentInvalidationQueueKey(organizationId));
      if (!encoded) break;
      try {
        values.push(JSON.parse(encoded) as ConsentInvalidation);
      } catch {
        logger.warn({ organizationId }, "consent.invalidation_invalid_payload");
      }
    }
    return values;
  } catch (error) {
    logger.error({ error, organizationId }, "consent.invalidation_pop_failed");
    return [];
  }
}
