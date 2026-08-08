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
