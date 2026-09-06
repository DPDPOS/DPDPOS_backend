import { createApp } from "./app.js";
import { appConfig } from "./config/app.config.js";
import { connectDatabase, disconnectDatabase } from "./infrastructure/database/prisma-client.js";
import { connectRedis, disconnectRedis } from "./infrastructure/cache/redis-client.js";
import { logger } from "./infrastructure/logging/logger.js";
import { startOutboxRelay, stopOutboxRelay } from "./events/outbox/outbox-relay.worker.js";

async function main() {
  try {
    await connectDatabase();
  } catch (err: any) {
    logger.warn({ err: err.message }, "database.connect_warning: PostgreSQL not reachable, running with in-memory storage");
  }

  try {
    await connectRedis();
  } catch (err: any) {
    logger.warn({ err: err.message }, "redis.connect_warning: Redis not reachable, running with local queues");
  }

  const app = createApp();

  try {
    startOutboxRelay();
  } catch (err: any) {
    logger.warn({ err: err.message }, "outbox.start_warning");
  }

  const server = app.listen(appConfig.port, "0.0.0.0", () => {
    logger.info({ port: appConfig.port, host: "0.0.0.0" }, "api.listening");
    console.log(`\n🚀 DPDP Sentinel Control Plane & API running at http://localhost:${appConfig.port}`);
    console.log(`📊 DPO Portal Dashboard available at http://localhost:${appConfig.port}/\n`);
  });

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "api.shutdown");
    try { stopOutboxRelay(); } catch {}
    server.close();
    try { await disconnectRedis(); } catch {}
    try { await disconnectDatabase(); } catch {}
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  logger.fatal({ err }, "api.boot_failed");
  process.exit(1);
});
