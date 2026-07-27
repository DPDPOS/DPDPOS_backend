import { createApp } from "./app.js";
import { appConfig } from "./config/app.config.js";
import { connectDatabase, disconnectDatabase } from "./infrastructure/database/prisma-client.js";
import { connectRedis, disconnectRedis } from "./infrastructure/cache/redis-client.js";
import { logger } from "./infrastructure/logging/logger.js";
import { startOutboxRelay, stopOutboxRelay } from "./events/outbox/outbox-relay.worker.js";

async function main() {
  await connectDatabase();
  await connectRedis();

  const app = createApp();
  startOutboxRelay();

  const server = app.listen(appConfig.port, () => {
    logger.info({ port: appConfig.port }, "api.listening");
  });

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "api.shutdown");
    stopOutboxRelay();
    server.close();
    await disconnectRedis();
    await disconnectDatabase();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  logger.fatal({ err }, "api.boot_failed");
  process.exit(1);
});
