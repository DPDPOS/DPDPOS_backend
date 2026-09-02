import { createHash } from "node:crypto";
import type { AssessmentActorType, Prisma } from "@prisma/client";
import { prisma } from "../../../infrastructure/database/prisma-client.js";

export async function appendAssessmentAudit(params: {
  assessmentId: string;
  organizationId: string;
  actorType: AssessmentActorType;
  actorUserId?: string | null;
  action: string;
  objectType: string;
  objectId?: string | null;
  payload?: unknown;
  tx?: Prisma.TransactionClient;
}): Promise<void> {
  const db = params.tx ?? prisma;
  const last = await db.assessmentAuditEvent.findFirst({
    where: { assessmentId: params.assessmentId },
    orderBy: { createdAt: "desc" },
    select: { eventHash: true },
  });

  const payloadHash = createHash("sha256")
    .update(JSON.stringify(params.payload ?? {}))
    .digest("hex");
  const prevEventHash = last?.eventHash ?? null;
  const eventHash = createHash("sha256")
    .update(
      [
        params.assessmentId,
        params.action,
        params.objectType,
        params.objectId ?? "",
        payloadHash,
        prevEventHash ?? "GENESIS",
      ].join("|"),
    )
    .digest("hex");

  await db.assessmentAuditEvent.create({
    data: {
      assessmentId: params.assessmentId,
      organizationId: params.organizationId,
      actorType: params.actorType,
      actorUserId: params.actorUserId ?? null,
      action: params.action,
      objectType: params.objectType,
      objectId: params.objectId ?? null,
      payloadHash,
      eventHash,
      prevEventHash,
    },
  });
}

/**
 * Recomputes the hash chain for an assessment and reports whether it is intact.
 */
export async function verifyAssessmentAuditChain(params: {
  assessmentId: string;
  organizationId: string;
}): Promise<{
  valid: boolean;
  eventCount: number;
  brokenAtId: string | null;
  expectedHash: string | null;
  actualHash: string | null;
}> {
  const events = await prisma.assessmentAuditEvent.findMany({
    where: {
      assessmentId: params.assessmentId,
      organizationId: params.organizationId,
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      action: true,
      objectType: true,
      objectId: true,
      payloadHash: true,
      eventHash: true,
      prevEventHash: true,
    },
  });

  let prev: string | null = null;
  for (const event of events) {
    if ((event.prevEventHash ?? null) !== prev) {
      return {
        valid: false,
        eventCount: events.length,
        brokenAtId: event.id,
        expectedHash: prev,
        actualHash: event.prevEventHash,
      };
    }
    const recomputed: string = createHash("sha256")
      .update(
        [
          params.assessmentId,
          event.action,
          event.objectType,
          event.objectId ?? "",
          event.payloadHash,
          prev ?? "GENESIS",
        ].join("|"),
      )
      .digest("hex");
    if (recomputed !== event.eventHash) {
      return {
        valid: false,
        eventCount: events.length,
        brokenAtId: event.id,
        expectedHash: recomputed,
        actualHash: event.eventHash,
      };
    }
    prev = event.eventHash;
  }

  return {
    valid: true,
    eventCount: events.length,
    brokenAtId: null,
    expectedHash: null,
    actualHash: null,
  };
}
