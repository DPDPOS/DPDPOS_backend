import { connectDatabase, disconnectDatabase } from "./infrastructure/database/prisma-client.js";
import { connectRedis, disconnectRedis } from "./infrastructure/cache/redis-client.js";
import { logger } from "./infrastructure/logging/logger.js";
import { registerJobProcessors, stopJobProcessors } from "./jobs/registry.js";
import { registerEventSubscribers } from "./bootstrap/register-events.js";
import { startOutboxRelay, stopOutboxRelay } from "./events/outbox/outbox-relay.worker.js";
import { startEventBusWorker, stopEventBusWorker } from "./events/event-bus.worker.js";

async function main() {
  await connectDatabase();
  await connectRedis();
  registerEventSubscribers();
  await registerJobProcessors();
  startEventBusWorker();
  startOutboxRelay();
  logger.info("worker.ready");

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, "worker.shutdown");
    try {
      await stopJobProcessors();
      stopOutboxRelay();
      await stopEventBusWorker();
      await disconnectRedis();
      await disconnectDatabase();
      process.exit(0);
    } catch (err) {
      logger.error({ err }, "worker.shutdown_failed");
      process.exit(1);
    }
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  logger.fatal({ err }, "worker.boot_failed");
  process.exit(1);
});
