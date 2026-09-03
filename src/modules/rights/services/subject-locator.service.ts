import { z } from "zod";
import { Router } from "express";
import type { NextFunction, Response } from "express";
import { prisma } from "../../../infrastructure/database/prisma-client.js";
import { authenticate } from "../../../shared/middleware/authenticate.middleware.js";
import { requirePermission } from "../../../shared/guards/permission.guard.js";
import { validateQuery } from "../../../shared/middleware/validate.middleware.js";
import { sendSuccess } from "../../../shared/middleware/response-envelope.middleware.js";
import type { AuthenticatedRequest } from "../../../shared/types/authenticated-request.js";
import { PERMISSIONS } from "../../../shared/constants/permissions.js";

const querySchema = z.object({
  q: z.string().trim().min(2).max(255),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
});

export type LocatorHit = {
  id: string;
  score: number;
  match: "exact" | "prefix" | "contains";
  [key: string]: unknown;
};

function scoreField(needle: string, value: string | null | undefined): LocatorHit["match"] | null {
  if (!value) return null;
  const hay = value.toLowerCase();
  const n = needle.toLowerCase();
  if (hay === n) return "exact";
  if (hay.startsWith(n)) return "prefix";
  if (hay.includes(n)) return "contains";
  return null;
}

function bestScore(
  needle: string,
  fields: Array<string | null | undefined>,
): { score: number; match: LocatorHit["match"] } | null {
  let best: LocatorHit["match"] | null = null;
  for (const f of fields) {
    const m = scoreField(needle, f);
    if (!m) continue;
    if (m === "exact") return { score: 100, match: "exact" };
    if (m === "prefix") best = best === "exact" ? best : "prefix";
    else if (!best) best = "contains";
  }
  if (!best) return null;
  return {
    match: best,
    score: best === "prefix" ? 70 : 40,
  };
}

function sortHits<T extends LocatorHit>(items: T[]): T[] {
  return items.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

/**
 * Subject-centric locator: finds consent, DSRs, processing activities, vendors,
 * assets, evidence, audit, and agreements that may hold the subject's data.
 */
export async function locateSubject(
  organizationId: string,
  q: string,
  limit = 50,
) {
  const needle = q.trim();
  const take = Math.min(200, Math.max(1, limit));

  const [
    consents,
    requests,
    activities,
    vendors,
    assets,
    evidence,
    auditLogs,
    agreements,
  ] = await Promise.all([
    prisma.consentRecord.findMany({
      where: {
        organizationId,
        deletedAt: null,
        OR: [
          { dataSubjectIdentifier: { contains: needle, mode: "insensitive" } },
          { purpose: { contains: needle, mode: "insensitive" } },
        ],
      },
      take,
      orderBy: { createdAt: "desc" },
    }),
    prisma.dataSubjectRequest.findMany({
      where: {
        organizationId,
        deletedAt: null,
        requesterReference: { contains: needle, mode: "insensitive" },
      },
      take,
      orderBy: { openedAt: "desc" },
    }),
    prisma.processingActivity.findMany({
      where: {
        organizationId,
        deletedAt: null,
        OR: [
          { purpose: { contains: needle, mode: "insensitive" } },
          { processorName: { contains: needle, mode: "insensitive" } },
          { notes: { contains: needle, mode: "insensitive" } },
        ],
      },
      take,
      include: { vendor: true },
    }),
    prisma.vendor.findMany({
      where: {
        organizationId,
        deletedAt: null,
        OR: [
          { name: { contains: needle, mode: "insensitive" } },
          { services: { contains: needle, mode: "insensitive" } },
        ],
      },
      take,
    }),
    prisma.dataAsset.findMany({
      where: {
        organizationId,
        deletedAt: null,
        OR: [
          { assetName: { contains: needle, mode: "insensitive" } },
          { description: { contains: needle, mode: "insensitive" } },
          { storageLocation: { contains: needle, mode: "insensitive" } },
        ],
      },
      take,
    }),
    prisma.evidenceFile.findMany({
      where: {
        organizationId,
        deletedAt: null,
        OR: [
          { fileName: { contains: needle, mode: "insensitive" } },
          { description: { contains: needle, mode: "insensitive" } },
          { tags: { has: needle } },
        ],
      },
      take,
    }),
    prisma.auditLog.findMany({
      where: {
        organizationId,
        OR: [
          { actionType: { contains: needle, mode: "insensitive" } },
          { entityType: { contains: needle, mode: "insensitive" } },
          { entityId: { contains: needle, mode: "insensitive" } },
        ],
      },
      take,
      orderBy: { createdAt: "desc" },
    }),
    prisma.vendorAgreement.findMany({
      where: {
        organizationId,
        deletedAt: null,
        OR: [
          { title: { contains: needle, mode: "insensitive" } },
          { notes: { contains: needle, mode: "insensitive" } },
        ],
      },
      take,
      include: { vendor: { select: { name: true } } },
    }),
  ]);

  const consentRecords = sortHits(
    consents
      .map((c) => {
        const s = bestScore(needle, [c.dataSubjectIdentifier, c.purpose]);
        if (!s) return null;
        return {
          id: c.id,
          score: s.score,
          match: s.match,
          subjectReference: c.dataSubjectIdentifier,
          purpose: c.purpose,
          state: c.consentState,
          createdAt: c.createdAt.toISOString(),
        };
      })
      .filter(Boolean) as LocatorHit[],
  );

  const dataSubjectRequests = sortHits(
    requests
      .map((r) => {
        const s = bestScore(needle, [r.requesterReference]);
        if (!s) return null;
        return {
          id: r.id,
          score: s.score,
          match: s.match,
          requestType: r.requestType,
          status: r.status,
          openedAt: r.openedAt.toISOString(),
        };
      })
      .filter(Boolean) as LocatorHit[],
  );

  const processingActivities = sortHits(
    activities
      .map((a) => {
        const s = bestScore(needle, [a.purpose, a.processorName, a.notes]);
        if (!s) return null;
        return {
          id: a.id,
          score: s.score,
          match: s.match,
          purpose: a.purpose,
          processorName: a.processorName,
          vendorId: a.vendorId,
          vendorName: a.vendor?.name ?? null,
        };
      })
      .filter(Boolean) as LocatorHit[],
  );

  const vendorHits = sortHits(
    vendors
      .map((v) => {
        const s = bestScore(needle, [v.name, v.services]);
        if (!s) return null;
        return {
          id: v.id,
          score: s.score,
          match: s.match,
          name: v.name,
          status: v.status,
          criticality: v.criticality,
        };
      })
      .filter(Boolean) as LocatorHit[],
  );

  const dataAssets = sortHits(
    assets
      .map((a) => {
        const s = bestScore(needle, [
          a.assetName,
          a.description,
          a.storageLocation,
        ]);
        if (!s) return null;
        return {
          id: a.id,
          score: s.score,
          match: s.match,
          assetName: a.assetName,
          description: a.description,
          storageLocation: a.storageLocation,
        };
      })
      .filter(Boolean) as LocatorHit[],
  );

  const evidenceFiles = sortHits(
    evidence
      .map((e) => {
        const s = bestScore(needle, [
          e.fileName,
          e.description,
          ...(e.tags ?? []),
        ]);
        if (!s) return null;
        return {
          id: e.id,
          score: s.score,
          match: s.match,
          fileName: e.fileName,
          description: e.description,
          tags: e.tags,
        };
      })
      .filter(Boolean) as LocatorHit[],
  );

  const auditHits = sortHits(
    auditLogs
      .map((a) => {
        const s = bestScore(needle, [a.actionType, a.entityType, a.entityId]);
        if (!s) return null;
        return {
          id: a.id,
          score: s.score,
          match: s.match,
          action: a.actionType,
          entityType: a.entityType,
          entityId: a.entityId,
          createdAt: a.createdAt.toISOString(),
        };
      })
      .filter(Boolean) as LocatorHit[],
  );

  const vendorAgreements = sortHits(
    agreements
      .map((a) => {
        const s = bestScore(needle, [a.title, a.notes]);
        if (!s) return null;
        return {
          id: a.id,
          score: s.score,
          match: s.match,
          title: a.title,
          vendorName: a.vendor?.name ?? null,
          notes: a.notes,
        };
      })
      .filter(Boolean) as LocatorHit[],
  );

  return {
    query: needle,
    limit: take,
    hits: {
      consentRecords,
      dataSubjectRequests,
      processingActivities,
      vendors: vendorHits,
      dataAssets,
      evidenceFiles,
      auditLogs: auditHits,
      vendorAgreements,
    },
  };
}

export function createSubjectLocatorRouter(): Router {
  const router = Router();
  router.get(
    "/",
    authenticate,
    requirePermission(PERMISSIONS.RIGHTS_REQUEST_READ),
    validateQuery(querySchema),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const limit = Number((req.query as { limit?: string }).limit ?? 50);
        const result = await locateSubject(
          req.context!.organizationId,
          String(req.query.q),
          limit,
        );
        sendSuccess(res, result);
      } catch (err) {
        next(err);
      }
    },
  );
  return router;
}
