import { connectDatabase, disconnectDatabase } from "./infrastructure/database/prisma-client.js";
import { connectRedis, disconnectRedis } from "./infrastructure/cache/redis-client.js";
import { logger } from "./infrastructure/logging/logger.js";
import { registerJobProcessors } from "./jobs/registry.js";
import { startOutboxRelay, stopOutboxRelay } from "./events/outbox/outbox-relay.worker.js";

async function main() {
  await connectDatabase();
  await connectRedis();
  await registerJobProcessors();
  startOutboxRelay();
  logger.info("worker.ready");

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "worker.shutdown");
    stopOutboxRelay();
    await disconnectRedis();
    await disconnectDatabase();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  logger.fatal({ err }, "worker.boot_failed");
  process.exit(1);
});
