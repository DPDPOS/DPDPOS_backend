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
});

/**
 * Subject-centric locator: finds consent, DSRs, processing activities, and
 * vendors that may hold the subject's personal data (Trace-parity).
 */
export async function locateSubject(
  organizationId: string,
  q: string,
) {
  const needle = q.trim();
  const [consents, requests, activities, vendors] = await Promise.all([
    prisma.consentRecord.findMany({
      where: {
        organizationId,
        deletedAt: null,
        OR: [
          { dataSubjectIdentifier: { contains: needle, mode: "insensitive" } },
          { purpose: { contains: needle, mode: "insensitive" } },
        ],
      },
      take: 50,
      orderBy: { createdAt: "desc" },
    }),
    prisma.dataSubjectRequest.findMany({
      where: {
        organizationId,
        deletedAt: null,
        requesterReference: { contains: needle, mode: "insensitive" },
      },
      take: 50,
      orderBy: { createdAt: "desc" },
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
      take: 50,
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
      take: 50,
    }),
  ]);

  return {
    query: needle,
    hits: {
      consentRecords: consents.map((c) => ({
        id: c.id,
        subjectReference: c.dataSubjectIdentifier,
        purpose: c.purpose,
        state: c.consentState,
        createdAt: c.createdAt.toISOString(),
      })),
      dataSubjectRequests: requests.map((r) => ({
        id: r.id,
        requestType: r.requestType,
        status: r.status,
        openedAt: r.openedAt.toISOString(),
      })),
      processingActivities: activities.map((a) => ({
        id: a.id,
        purpose: a.purpose,
        processorName: a.processorName,
        vendorId: a.vendorId,
        vendorName: a.vendor?.name ?? null,
      })),
      vendors: vendors.map((v) => ({
        id: v.id,
        name: v.name,
        status: v.status,
        criticality: v.criticality,
      })),
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
        const result = await locateSubject(
          req.context!.organizationId,
          String(req.query.q),
        );
        sendSuccess(res, result);
      } catch (err) {
        next(err);
      }
    },
  );
  return router;
}
