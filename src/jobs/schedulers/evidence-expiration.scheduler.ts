import { Queue, Worker } from "bullmq";
import { notificationService } from "../../modules/notifications/services/notification.service.js";
import { SYSTEM_ACTOR_ID } from "../../shared/constants/system-actor.js";
import { prisma } from "../../infrastructure/database/prisma-client.js";
import { logger } from "../../infrastructure/logging/logger.js";
import { createBullMqConnectionOptions } from "../../infrastructure/queue/bullmq-connection.js";

const QUEUE_NAME = "evidence-expiration";
const MS_PER_DAY = 24 * 60 * 60 * 1000;

let queue: Queue | null = null;
let worker: Worker | null = null;

async function scanExpiringEvidence(): Promise<void> {
  const now = Date.now();
  // Notify at 30 / 7 / 1 day before expiry, and on the day it expires.
  const thresholds = [30, 7, 1, 0];

  for (const days of thresholds) {
    const windowStart = new Date(now + days * MS_PER_DAY);
    const windowEnd = new Date(now + (days + 1) * MS_PER_DAY);

    const files = await prisma.evidenceFile.findMany({
      where: {
        deletedAt: null,
        expiresAt:
          days === 0
            ? { lt: new Date(now), gte: new Date(now - MS_PER_DAY) }
            : { gte: windowStart, lt: windowEnd },
        status: { in: ["APPROVED", "LOCKED", "MAPPED", "UNDER_REVIEW"] },
      },
      select: {
        id: true,
        fileName: true,
        organizationId: true,
        uploadedBy: true,
        controlId: true,
        expiresAt: true,
        control: { select: { ownerUserId: true, code: true } },
      },
      take: 500,
    });

    for (const file of files) {
      const recipient =
        file.control?.ownerUserId ?? file.uploadedBy ?? null;
      if (!recipient) continue;

      const label =
        days === 0
          ? "expired"
          : `expires in ${days} day${days === 1 ? "" : "s"}`;
      const controlHint = file.control?.code
        ? ` (control ${file.control.code})`
        : "";

      await notificationService.send(
        {
          organizationId: file.organizationId,
          actorUserId: SYSTEM_ACTOR_ID,
          correlationId: `evidence-expiry:${file.id}:${days}`,
          permissions: [],
          roles: [],
        },
        recipient,
        "SLA_WARNING",
        {
          title: `Evidence "${file.fileName}" ${label}${controlHint}`,
        },
        { type: "EvidenceFile", id: file.id },
      );
    }
  }

  logger.info("scheduler.evidence_expiration.scan_complete");
}

export async function registerEvidenceExpirationScheduler(): Promise<void> {
  if (queue) return;

  queue = new Queue(QUEUE_NAME, {
    connection: createBullMqConnectionOptions(),
  });

  worker = new Worker(
    QUEUE_NAME,
    async () => {
      await scanExpiringEvidence();
    },
    { connection: createBullMqConnectionOptions(), concurrency: 1 },
  );

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, err }, "scheduler.evidence_expiration.failed");
  });

  await queue.add(
    "scan-evidence-expiration",
    {},
    {
      repeat: { pattern: "0 6 * * *" }, // daily 06:00 UTC
      jobId: "evidence-expiration-daily",
      removeOnComplete: 20,
      removeOnFail: 50,
    },
  );

  logger.info({ cron: "0 6 * * *" }, "scheduler.evidence_expiration.registered");
}

export async function stopEvidenceExpirationScheduler(): Promise<void> {
  await Promise.all([worker?.close(), queue?.close()]);
  worker = null;
  queue = null;
}
