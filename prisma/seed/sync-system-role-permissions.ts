/**
 * Refresh system role permission arrays for EVERY organisation so newly
 * added catalog entries (e.g. vendor:*) land on existing ORG_ADMIN / DPO roles.
 * Also clears Redis permission caches so /auth/me and API guards see the update.
 *
 * Usage: npx tsx prisma/seed/sync-system-role-permissions.ts
 */
import { PrismaClient } from "@prisma/client";
import { SYSTEM_ROLE_PRESETS } from "../../src/shared/constants/permissions.js";
import { getRedis } from "../../src/infrastructure/cache/redis-client.js";

const prisma = new PrismaClient();

async function flushPermissionCache(): Promise<number> {
  try {
    const redis = getRedis();
    // Avoid hanging forever if Redis is mid-reconnect.
    if (redis.status !== "ready") {
      await Promise.race([
        redis.connect(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("redis connect timeout")), 3000),
        ),
      ]);
    }
    const keys = await redis.keys("auth:permissions:*");
    if (keys.length === 0) return 0;
    await redis.del(...keys);
    return keys.length;
  } catch (err) {
    console.warn(
      "Permission cache flush skipped:",
      err instanceof Error ? err.message : err,
    );
    return 0;
  }
}

async function main() {
  const orgs = await prisma.organization.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true },
  });

  let updated = 0;
  for (const org of orgs) {
    for (const [name, permissions] of Object.entries(SYSTEM_ROLE_PRESETS)) {
      const result = await prisma.role.updateMany({
        where: {
          organizationId: org.id,
          name,
          isSystemRole: true,
          deletedAt: null,
        },
        data: { permissions: [...permissions] },
      });
      updated += result.count;
    }
    console.log(`Synced system roles for org ${org.name} (${org.id})`);
  }

  const flushed = await flushPermissionCache();
  console.log(`Done. Updated ${updated} role row(s) across ${orgs.length} org(s).`);
  console.log(`Flushed ${flushed} Redis permission cache key(s).`);
  console.log("Users should hard-refresh or log out/in so the UI reloads /auth/me.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
