import { Queue, Worker } from "bullmq";
import { notificationService } from "../../modules/notifications/services/notification.service.js";
import { SYSTEM_ACTOR_ID } from "../../shared/constants/system-actor.js";
import { prisma } from "../../infrastructure/database/prisma-client.js";
import { logger } from "../../infrastructure/logging/logger.js";
import { DPDP_REGULATORY_DEADLINES } from "../../shared/domain/dpdp.constants.js";
import { createBullMqConnectionOptions } from "../../infrastructure/queue/bullmq-connection.js";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const QUEUE_NAME = "sla-reminder";

let queue: Queue | null = null;
let worker: Worker | null = null;

async function notifyDeadline(input: {
  organizationId: string;
  recipientUserId: string;
  title: string;
}): Promise<void> {
  await notificationService.send(
    {
      organizationId: input.organizationId,
      actorUserId: SYSTEM_ACTOR_ID,
      correlationId: `sla:${input.title}`,
      permissions: [],
      roles: [],
    },
    input.recipientUserId,
    "SLA_WARNING",
    { title: input.title },
  );
}

async function scanControlDueDates(): Promise<void> {
  const now = Date.now();
  const thresholds = [30, 7, 1, 0];

  for (const days of thresholds) {
    const windowStart = new Date(now + days * MS_PER_DAY);
    const windowEnd = new Date(now + (days + 1) * MS_PER_DAY);

    const controls = await prisma.control.findMany({
      where: {
        deletedAt: null,
        status: { in: ["NOT_STARTED", "IN_PROGRESS"] },
        dueAt:
          days === 0
            ? { lt: new Date(now) }
            : { gte: windowStart, lt: windowEnd },
        ownerUserId: { not: null },
      },
      select: {
        code: true,
        organizationId: true,
        ownerUserId: true,
        dueAt: true,
      },
    });

    for (const c of controls) {
      if (!c.ownerUserId) continue;
      const label =
        days === 0 ? "overdue" : `due in ${days} day${days === 1 ? "" : "s"}`;
      await notifyDeadline({
        organizationId: c.organizationId,
        recipientUserId: c.ownerUserId,
        title: `Control ${c.code} ${label} (${c.dueAt?.toISOString() ?? "unknown"})`,
      });
    }
  }
}

async function scanRightsRequestDueDates(): Promise<void> {
  const now = Date.now();
  const thresholds = [7, 1, 0];

  for (const days of thresholds) {
    const windowStart = new Date(now + days * MS_PER_DAY);
    const windowEnd = new Date(now + (days + 1) * MS_PER_DAY);

    const requests = await prisma.dataSubjectRequest.findMany({
      where: {
        deletedAt: null,
        status: { in: ["SUBMITTED", "ASSIGNED", "IN_PROGRESS"] },
        dueAt:
          days === 0
            ? { lt: new Date(now) }
            : { gte: windowStart, lt: windowEnd },
        assignedTo: { not: null },
      },
      select: {
        organizationId: true,
        assignedTo: true,
        requestType: true,
        dueAt: true,
      },
    });

    for (const r of requests) {
      if (!r.assignedTo) continue;
      const label =
        days === 0 ? "overdue" : `due in ${days} day${days === 1 ? "" : "s"}`;
      await notifyDeadline({
        organizationId: r.organizationId,
        recipientUserId: r.assignedTo,
        title: `Rights request ${r.requestType} ${label} (${r.dueAt?.toISOString() ?? "unknown"})`,
      });
    }
  }
}

async function scanRegulatoryMilestones(): Promise<void> {
  const now = Date.now();
  const milestones = [
    {
      label: "Consent Manager registration",
      date: DPDP_REGULATORY_DEADLINES.CONSENT_MANAGER_REGISTRATION,
    },
    {
      label: "Full DPDP compliance",
      date: DPDP_REGULATORY_DEADLINES.FULL_COMPLIANCE,
    },
  ];

  for (const milestone of milestones) {
    const target = new Date(milestone.date).getTime();
    const daysUntil = Math.ceil((target - now) / MS_PER_DAY);

    if (daysUntil !== 90 && daysUntil !== 30) continue;

    const orgs = await prisma.organization.findMany({
      where: { deletedAt: null, status: "ACTIVE" },
      select: { id: true },
    });

    for (const org of orgs) {
      const dpo = await prisma.user.findFirst({
        where: {
          organizationId: org.id,
          deletedAt: null,
          userRoles: {
            some: {
              role: {
                name: { in: ["DPO", "ORG_ADMIN", "COMPLIANCE_OFFICER"] },
              },
            },
          },
        },
        select: { id: true },
        take: 1,
      });

      if (!dpo) continue;

      await notifyDeadline({
        organizationId: org.id,
        recipientUserId: dpo.id,
        title: `${milestone.label} in ${daysUntil} days (${milestone.date})`,
      });
    }
  }
}

async function scanOrphanRequirements(): Promise<void> {
  const cutoff = new Date(Date.now() - 7 * MS_PER_DAY);
  const orphans = await prisma.requirement.findMany({
    where: {
      deletedAt: null,
      controlId: null,
      createdAt: { lt: cutoff },
    },
    select: { id: true, code: true, organizationId: true },
  });

  for (const req of orphans) {
    const admin = await prisma.user.findFirst({
      where: {
        organizationId: req.organizationId,
        deletedAt: null,
        userRoles: {
          some: {
            role: { name: { in: ["DPO", "ORG_ADMIN", "COMPLIANCE_OFFICER"] } },
          },
        },
      },
      select: { id: true },
      take: 1,
    });
    if (!admin) continue;

    await notifyDeadline({
      organizationId: req.organizationId,
      recipientUserId: admin.id,
      title: `Orphan obligation ${req.code} unmapped for 7+ days`,
    });
  }
}

async function runSlaReminderSweep(): Promise<void> {
  logger.info("scheduler.sla_reminder.start");
  await scanControlDueDates();
  await scanRightsRequestDueDates();
  await scanRegulatoryMilestones();
  await scanOrphanRequirements();
  try {
    const { violationEscalationService } = await import(
      "../../modules/violations/services/violation-escalation.service.js"
    );
    await violationEscalationService.scanAndEscalate();
  } catch (err) {
    logger.error({ err }, "scheduler.sla_reminder.violation_escalation_failed");
  }
  logger.info("scheduler.sla_reminder.complete");
}

export async function registerSlaReminderScheduler(): Promise<void> {
  const connection = createBullMqConnectionOptions();
  queue = new Queue(QUEUE_NAME, { connection });

  await queue.add(
    "daily-sla-reminder",
    {},
    {
      repeat: { pattern: "0 6 * * *" },
      jobId: "daily-sla-reminder",
    },
  );

  worker = new Worker(
    QUEUE_NAME,
    async () => {
      await runSlaReminderSweep();
    },
    { connection },
  );

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, err }, "scheduler.sla_reminder.failed");
  });

  logger.info("scheduler.sla_reminder.registered");
}

export async function stopSlaReminderScheduler(): Promise<void> {
  await worker?.close();
  await queue?.close();
  worker = null;
  queue = null;
}
