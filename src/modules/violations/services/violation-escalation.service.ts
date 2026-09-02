import { prisma } from "../../../infrastructure/database/prisma-client.js";
import { logger } from "../../../infrastructure/logging/logger.js";
import { notificationService } from "../../notifications/services/notification.service.js";
import { SYSTEM_ACTOR_ID } from "../../../shared/constants/system-actor.js";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Default SLA days from openedAt when dueAt is null. */
const SEVERITY_SLA_DAYS: Record<string, number> = {
  CRITICAL: 2,
  HIGH: 5,
  MEDIUM: 10,
  LOW: 20,
};

function effectiveDueAt(openedAt: Date, dueAt: Date | null, severity: string): Date {
  if (dueAt) return dueAt;
  const days = SEVERITY_SLA_DAYS[severity] ?? 10;
  return new Date(openedAt.getTime() + days * MS_PER_DAY);
}

/**
 * Escalates overdue / approaching-due violations to assignees and DPO users.
 * Does not change violation status — notifies and logs for auditability.
 */
export class ViolationEscalationService {
  async scanAndEscalate(now = new Date()): Promise<{ notified: number }> {
    const open = await prisma.violation.findMany({
      where: {
        deletedAt: null,
        status: {
          notIn: ["CLOSED", "ARCHIVED", "VALIDATED"],
        },
      },
      select: {
        id: true,
        organizationId: true,
        title: true,
        severity: true,
        status: true,
        openedAt: true,
        dueAt: true,
        assignedTo: true,
      },
      take: 500,
    });

    let notified = 0;

    for (const v of open) {
      const due = effectiveDueAt(v.openedAt, v.dueAt, v.severity);
      const daysLeft = Math.ceil((due.getTime() - now.getTime()) / MS_PER_DAY);

      let level: "WARN" | "OVERDUE" | null = null;
      if (daysLeft < 0) level = "OVERDUE";
      else if (daysLeft <= 2) level = "WARN";
      if (!level) continue;

      const recipients = new Set<string>();
      if (v.assignedTo) recipients.add(v.assignedTo);

      const dpos = await prisma.user.findMany({
        where: {
          organizationId: v.organizationId,
          deletedAt: null,
          status: { not: "DISABLED" },
          userRoles: {
            some: {
              role: {
                name: { in: ["DPO", "ORG_ADMIN", "COMPLIANCE_OFFICER"] },
              },
            },
          },
        },
        select: { id: true },
        take: 5,
      });
      for (const d of dpos) recipients.add(d.id);

      const title =
        level === "OVERDUE"
          ? `OVERDUE ${v.severity} violation: ${v.title}`
          : `SLA warning (${daysLeft}d): ${v.title}`;

      for (const userId of recipients) {
        try {
          await notificationService.send(
            {
              organizationId: v.organizationId,
              actorUserId: SYSTEM_ACTOR_ID,
              correlationId: `violation-escalation:${v.id}:${level}`,
              permissions: [],
              roles: [],
            },
            userId,
            "SLA_WARNING",
            { title },
            { type: "Violation", id: v.id },
          );
          notified += 1;
        } catch (err) {
          logger.warn(
            { err, violationId: v.id, userId },
            "violation.escalation_notify_failed",
          );
        }
      }
    }

    logger.info({ notified, scanned: open.length }, "violation.escalation_scan_complete");
    return { notified };
  }
}

export const violationEscalationService = new ViolationEscalationService();
