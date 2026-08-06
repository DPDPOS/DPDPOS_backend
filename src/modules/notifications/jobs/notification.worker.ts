import { Worker } from "bullmq";
import { createBullMqConnectionOptions } from "../../../infrastructure/queue/bullmq-connection.js";
import { QUEUE_NAMES } from "../../../jobs/queues/queue-names.js";
import { logger } from "../../../infrastructure/logging/logger.js";
import { prisma } from "../../../infrastructure/database/prisma-client.js";
import { writeOutboxEvent } from "../../../events/outbox/outbox.repository.js";
import { DOMAIN_EVENTS } from "../../../events/types/base-event.interface.js";
import { SYSTEM_ACTOR_ID } from "../../../shared/constants/system-actor.js";

let worker: Worker | null = null;

export function startNotificationWorker(): void {
  if (worker) return;
  
  worker = new Worker(QUEUE_NAMES.NOTIFICATION, async (job) => {
    const notificationId = job.data.notificationId as string | undefined;
    if (!notificationId) throw new Error("Missing notificationId in job data");
    const notification = await prisma.notification.findUnique({ where: { id: notificationId } });
    if (!notification || notification.status !== "PENDING") return;
    try {
      await prisma.$transaction(async (tx) => {
        await tx.notification.update({
          where: { id: notificationId },
          data: { status: "SENT", sentAt: new Date() },
        });
        await writeOutboxEvent(tx, {
          eventType: DOMAIN_EVENTS.NotificationSent,
          organizationId: notification.organizationId,
          payload: { id: notification.id, recipientUserId: notification.recipientUserId },
          actorUserId: SYSTEM_ACTOR_ID,
        });
      });
    } catch (error) {
      await prisma.notification.update({
        where: { id: notificationId },
        data: { status: "FAILED", retryCount: { increment: 1 } },
      });
      throw error;
    }
  }, {
    connection: createBullMqConnectionOptions(),
    concurrency: 5,
  });
  
  worker.on("completed", (job) => { logger.debug({ jobId: job.id }, "notification.job_completed"); });
  worker.on("failed", (job, err) => { logger.error({ jobId: job?.id, err }, "notification.job_failed"); });
  
  logger.info("notification.worker_started");
}

export function stopNotificationWorker(): Promise<void> {
  if (!worker) return Promise.resolve();
  const w = worker; 
  worker = null; 
  return w.close();
}
