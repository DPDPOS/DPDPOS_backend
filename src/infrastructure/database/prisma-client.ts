import { PrismaClient } from "@prisma/client";
import { logger } from "../logging/logger.js";

export const prisma = new PrismaClient({
  log:
    process.env.NODE_ENV === "development"
      ? [
          { emit: "event", level: "query" },
          { emit: "stdout", level: "warn" },
          { emit: "stdout", level: "error" },
        ]
      : [{ emit: "stdout", level: "error" }],
});

if (process.env.NODE_ENV === "development") {
  prisma.$on("query" as never, (e: { query: string; duration: number }) => {
    logger.debug({ query: e.query, durationMs: e.duration }, "prisma.query");
  });
}

export async function connectDatabase(): Promise<void> {
  await prisma.$connect();
  logger.info("database.connected");
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
  logger.info("database.disconnected");
}
