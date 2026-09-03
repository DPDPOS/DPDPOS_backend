import { Queue, Worker } from "bullmq";
import { prisma } from "../../infrastructure/database/prisma-client.js";
import { logger } from "../../infrastructure/logging/logger.js";
import { createBullMqConnectionOptions } from "../../infrastructure/queue/bullmq-connection.js";
import { writeOutboxEvent } from "../../events/outbox/outbox.repository.js";
import { DOMAIN_EVENTS } from "../../events/types/base-event.interface.js";
import { SYSTEM_ACTOR_ID } from "../../shared/constants/system-actor.js";
import { withTransaction } from "../../infrastructure/database/transaction-manager.js";

const QUEUE_NAME = "dpa-expiry";
const MS_PER_DAY = 24 * 60 * 60 * 1000;

let queue: Queue | null = null;
let worker: Worker | null = null;

/**
 * Daily scan of ACTIVE vendor agreements approaching expiry.
 * Emits DpaExpiring outbox events (deduped by agreement+day via job correlation).
 */
export async function scanExpiringDpas(now = new Date()): Promise<{ emitted: number }> {
  const windowEnd = new Date(now.getTime() + 60 * MS_PER_DAY);

  const agreements = await prisma.vendorAgreement.findMany({
    where: {
      deletedAt: null,
      status: "ACTIVE",
      expiresAt: { gte: now, lte: windowEnd },
    },
    select: {
      id: true,
      vendorId: true,
      organizationId: true,
      expiresAt: true,
      vendor: { select: { name: true } },
    },
    take: 500,
  });

  let emitted = 0;
  const dayKey = now.toISOString().slice(0, 10);

  for (const agreement of agreements) {
    if (!agreement.expiresAt) continue;
    const correlationId = `dpa-expiry:${agreement.id}:${dayKey}`;
    const already = await prisma.outboxEvent.findFirst({
      where: {
        organizationId: agreement.organizationId,
        eventType: DOMAIN_EVENTS.DpaExpiring,
        correlationId,
      },
      select: { id: true },
    });
    if (already) continue;

    await withTransaction(async (tx) => {
      await writeOutboxEvent(tx, {
        eventType: DOMAIN_EVENTS.DpaExpiring,
        organizationId: agreement.organizationId,
        actorUserId: SYSTEM_ACTOR_ID,
        correlationId,
        payload: {
          vendorId: agreement.vendorId,
          vendorName: agreement.vendor.name,
          agreementId: agreement.id,
          expiresAt: agreement.expiresAt!.toISOString(),
        },
      });
    });
    emitted += 1;
  }

  logger.info({ emitted, scanned: agreements.length }, "scheduler.dpa_expiry.scan_complete");
  return { emitted };
}

export async function registerDpaExpiryScheduler(): Promise<void> {
  if (queue) return;

  const connection = createBullMqConnectionOptions();
  queue = new Queue(QUEUE_NAME, { connection });
  worker = new Worker(
    QUEUE_NAME,
    async () => {
      await scanExpiringDpas();
    },
    { connection },
  );

  worker.on("failed", (job, err) => {
    logger.error({ err, jobId: job?.id }, "scheduler.dpa_expiry.job_failed");
  });

  await queue.add(
    "daily-dpa-expiry",
    {},
    {
      repeat: { pattern: "0 7 * * *" },
      jobId: "daily-dpa-expiry",
    },
  );

  logger.info("scheduler.dpa_expiry.registered");
}

export async function stopDpaExpiryScheduler(): Promise<void> {
  await Promise.all([worker?.close(), queue?.close()]);
  worker = null;
  queue = null;
}
