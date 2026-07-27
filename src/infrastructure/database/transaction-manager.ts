import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma-client.js";

export type TransactionClient = Prisma.TransactionClient;

export async function withTransaction<T>(
  fn: (tx: TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => fn(tx));
}
