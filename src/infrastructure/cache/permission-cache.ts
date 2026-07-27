import { getRedis } from "../cache/redis-client.js";

const PERMS_PREFIX = "auth:permissions:";
const DEFAULT_TTL_SECONDS = 900;

export type CachedPermissionSet = {
  permissions: string[];
  roles: string[];
};

function userKey(organizationId: string, userId: string): string {
  return `${PERMS_PREFIX}${organizationId}:${userId}`;
}

async function ensureRedisReady() {
  const redis = getRedis();
  if (redis.status !== "ready") {
    await redis.connect();
  }
  return redis;
}

export async function getCachedPermissions(
  organizationId: string,
  userId: string,
): Promise<CachedPermissionSet | null> {
  try {
    const redis = await ensureRedisReady();
    const raw = await redis.get(userKey(organizationId, userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedPermissionSet;
    if (!Array.isArray(parsed.permissions) || !Array.isArray(parsed.roles)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function setCachedPermissions(
  organizationId: string,
  userId: string,
  value: CachedPermissionSet,
  ttlSeconds = DEFAULT_TTL_SECONDS,
): Promise<void> {
  try {
    const redis = await ensureRedisReady();
    await redis.set(
      userKey(organizationId, userId),
      JSON.stringify(value),
      "EX",
      Math.max(1, ttlSeconds),
    );
  } catch {
    // Cache is best-effort; auth still works from JWT/DB.
  }
}

export async function invalidateUserPermissions(
  organizationId: string,
  userId: string,
): Promise<void> {
  try {
    const redis = await ensureRedisReady();
    await redis.del(userKey(organizationId, userId));
  } catch {
    // ignore
  }
}

export async function invalidatePermissionsForUsers(
  organizationId: string,
  userIds: string[],
): Promise<void> {
  if (userIds.length === 0) return;
  try {
    const redis = await ensureRedisReady();
    const keys = userIds.map((id) => userKey(organizationId, id));
    await redis.del(...keys);
  } catch {
    // ignore
  }
}
