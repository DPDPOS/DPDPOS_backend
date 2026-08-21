import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma-client.js";

export type TransactionClient = Prisma.TransactionClient;

/** Neon / remote DB latency routinely exceeds Prisma's 5s interactive default. */
const INTERACTIVE_TRANSACTION_TIMEOUT_MS = 20_000;

export async function withTransaction<T>(
  fn: (tx: TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => fn(tx), {
    timeout: INTERACTIVE_TRANSACTION_TIMEOUT_MS,
  });
}
