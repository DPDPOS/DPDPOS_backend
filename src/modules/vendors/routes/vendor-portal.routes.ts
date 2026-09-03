import { Router } from "express";
import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { randomBytes, randomUUID } from "node:crypto";
import { prisma } from "../../infrastructure/database/prisma-client.js";
import { authenticate } from "../../shared/middleware/authenticate.middleware.js";
import { requirePermission } from "../../shared/guards/permission.guard.js";
import { validateBody, validateParams } from "../../shared/middleware/validate.middleware.js";
import { sendSuccess } from "../../shared/middleware/response-envelope.middleware.js";
import {
  getRequestContext,
  type AuthenticatedRequest,
} from "../../shared/guards/auth.guard.js";
import { NotFoundError, ValidationError } from "../../shared/errors/app-error.js";
import { hashToken } from "../auth/utils/token-crypto.js";
import { PERMISSIONS } from "../../shared/constants/permissions.js";

const createTokenSchema = z.object({
  vendorId: z.string().uuid(),
  contactEmail: z.string().email().optional(),
  ttlDays: z.number().int().min(1).max(90).optional().default(14),
});

const portalUpdateSchema = z.object({
  notes: z.string().trim().max(4000).optional(),
  services: z.string().trim().max(2000).optional(),
  countries: z.array(z.string().trim().length(2)).max(50).optional(),
  evidenceFileId: z.string().uuid().optional(),
});

async function loadPortalVendor(rawToken: string) {
  const tokenHash = hashToken(rawToken);
  const row = await prisma.vendorPortalToken.findFirst({
    where: {
      tokenHash,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    include: {
      vendor: true,
    },
  });
  if (!row || row.vendor.deletedAt) {
    throw new NotFoundError("Portal link invalid or expired");
  }
  await prisma.vendorPortalToken.update({
    where: { id: row.id },
    data: { lastUsedAt: new Date() },
  });
  return row;
}

export function createVendorPortalRouter(): Router {
  const router = Router();

  /** Staff: mint magic link token for a vendor. */
  router.post(
    "/tokens",
    authenticate,
    requirePermission(PERMISSIONS.VENDOR_UPDATE),
    validateBody(createTokenSchema),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const ctx = getRequestContext(req);
        const body = req.body as z.infer<typeof createTokenSchema>;
        const vendor = await prisma.vendor.findFirst({
          where: {
            id: body.vendorId,
            organizationId: ctx.organizationId,
            deletedAt: null,
          },
        });
        if (!vendor) throw new NotFoundError("Vendor not found");

        const raw = randomBytes(32).toString("base64url");
        const tokenHash = hashToken(raw);
        const expiresAt = new Date(
          Date.now() + body.ttlDays * 24 * 60 * 60 * 1000,
        );
        await prisma.vendorPortalToken.create({
          data: {
            id: randomUUID(),
            organizationId: ctx.organizationId,
            vendorId: vendor.id,
            tokenHash,
            tokenPrefix: raw.slice(0, 8),
            contactEmail: body.contactEmail,
            expiresAt,
            createdBy: ctx.actorUserId,
          },
        });

        sendSuccess(
          res,
          {
            token: raw,
            expiresAt: expiresAt.toISOString(),
            portalPath: `/vendor-portal/${raw}`,
          },
          201,
        );
      } catch (err) {
        next(err);
      }
    },
  );

  router.get(
    "/:token",
    validateParams(z.object({ token: z.string().min(16).max(200) })),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const row = await loadPortalVendor(String(req.params.token));
        const reviews = await prisma.vendorDiligenceReview.findMany({
          where: {
            vendorId: row.vendorId,
            organizationId: row.organizationId,
            deletedAt: null,
          },
          orderBy: { createdAt: "desc" },
          take: 20,
          select: {
            id: true,
            outcome: true,
            residualRisk: true,
            notes: true,
            completedAt: true,
            createdAt: true,
          },
        });
        sendSuccess(res, {
          vendor: {
            id: row.vendor.id,
            name: row.vendor.name,
            services: row.vendor.services,
            countries: row.vendor.countries,
            notes: row.vendor.notes,
            status: row.vendor.status,
          },
          reviews,
        });
      } catch (err) {
        next(err);
      }
    },
  );

  router.patch(
    "/:token",
    validateParams(z.object({ token: z.string().min(16).max(200) })),
    validateBody(portalUpdateSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const row = await loadPortalVendor(String(req.params.token));
        const body = req.body as z.infer<typeof portalUpdateSchema>;

        if (body.evidenceFileId) {
          const file = await prisma.evidenceFile.findFirst({
            where: {
              id: body.evidenceFileId,
              organizationId: row.organizationId,
              deletedAt: null,
            },
          });
          if (!file) {
            throw new ValidationError("evidenceFileId not found in organisation");
          }
          await prisma.vendorAgreement.create({
            data: {
              organizationId: row.organizationId,
              vendorId: row.vendorId,
              title: "Portal-uploaded DPA evidence",
              versionLabel: `portal-${Date.now()}`,
              status: "DRAFT",
              evidenceFileId: body.evidenceFileId,
            },
          });
        }

        const updated = await prisma.vendor.update({
          where: { id: row.vendorId },
          data: {
            ...(body.notes !== undefined ? { notes: body.notes } : {}),
            ...(body.services !== undefined ? { services: body.services } : {}),
            ...(body.countries !== undefined
              ? { countries: body.countries }
              : {}),
          },
        });

        sendSuccess(res, {
          id: updated.id,
          name: updated.name,
          services: updated.services,
          countries: updated.countries,
          notes: updated.notes,
        });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
