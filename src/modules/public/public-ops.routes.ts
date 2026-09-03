import { Router } from "express";
import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../../infrastructure/database/prisma-client.js";
import { validateBody } from "../../shared/middleware/validate.middleware.js";
import { sendSuccess } from "../../shared/middleware/response-envelope.middleware.js";
import { RateLimitedError, ValidationError } from "../../shared/errors/app-error.js";
import { SYSTEM_ACTOR_ID } from "../../shared/constants/system-actor.js";
import { dataSubjectRequestService } from "../modules/rights/services/data-subject-request.service.js";
import { consentRecordService } from "../modules/consent/services/consent-record.service.js";
import { REQUEST_TYPES } from "../modules/rights/dto/data-subject-request.dto.js";
import type { RequestContext } from "../../shared/types/request-context.js";

const publicDsrSchema = z.object({
  organizationId: z.string().uuid().optional(),
  organizationSlug: z.string().trim().min(1).max(200).optional(),
  requestType: z.enum(REQUEST_TYPES),
  requesterReference: z.string().trim().min(1).max(500),
  description: z.string().trim().max(4000).optional(),
}).refine((v) => Boolean(v.organizationId || v.organizationSlug), {
  message: "organizationId or organizationSlug is required",
});

const cmWebhookSchema = z.object({
  organizationId: z.string().uuid(),
  dataSubjectIdentifier: z.string().trim().min(1).max(500),
  purpose: z.string().trim().min(1).max(255).optional(),
  purposes: z.array(z.string().trim().min(1).max(255)).min(1).max(20).optional(),
  consentState: z.enum(["GRANTED", "WITHDRAWN"]).optional(),
  grantedAt: z.string().datetime().optional(),
  expiresAt: z.string().datetime().optional(),
}).refine((v) => Boolean(v.purpose || (v.purposes && v.purposes.length)), {
  message: "purpose or purposes is required",
});

/** Simple in-memory rate limit: key → timestamps. */
const rateBuckets = new Map<string, number[]>();

function rateLimit(key: string, max = 10, windowMs = 60_000): void {
  const now = Date.now();
  const windowStart = now - windowMs;
  const hits = (rateBuckets.get(key) ?? []).filter((t) => t >= windowStart);
  if (hits.length >= max) {
    throw new RateLimitedError("Too many public DSR submissions; try again later");
  }
  hits.push(now);
  rateBuckets.set(key, hits);
}

async function resolveOrganizationId(input: {
  organizationId?: string;
  organizationSlug?: string;
}): Promise<string> {
  if (input.organizationId) {
    const org = await prisma.organization.findFirst({
      where: { id: input.organizationId, deletedAt: null },
      select: { id: true },
    });
    if (!org) throw new ValidationError("Organization not found");
    return org.id;
  }
  const slug = input.organizationSlug!.trim();
  const org = await prisma.organization.findFirst({
    where: {
      deletedAt: null,
      OR: [
        { id: slug },
        { name: { equals: slug, mode: "insensitive" } },
      ],
    },
    select: { id: true },
  });
  if (!org) throw new ValidationError("Organization not found");
  return org.id;
}

function publicCtx(organizationId: string, correlationId: string): RequestContext {
  return {
    organizationId,
    actorUserId: SYSTEM_ACTOR_ID,
    correlationId,
    permissions: [],
    roles: [],
  };
}

/**
 * Unauthenticated public intake + CM webhook stubs.
 */
export function createPublicOpsRouter(): Router {
  const router = Router();

  router.post(
    "/dsr",
    validateBody(publicDsrSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const body = req.body as z.infer<typeof publicDsrSchema>;
        const ip = req.ip || req.socket.remoteAddress || "unknown";
        rateLimit(`dsr:${ip}:${body.requesterReference.toLowerCase()}`);

        const organizationId = await resolveOrganizationId(body);
        const ctx = publicCtx(
          organizationId,
          (req.headers["x-correlation-id"] as string) || `public-dsr-${Date.now()}`,
        );

        const request = await dataSubjectRequestService.submit(ctx, {
          requestType: body.requestType,
          requesterReference: body.requesterReference,
        });

        sendSuccess(
          res,
          {
            id: request.id,
            status: request.status,
            requestType: request.requestType,
            deduped: request.deduped ?? false,
            dueAt: request.dueAt,
          },
          request.deduped ? 200 : 201,
        );
      } catch (err) {
        next(err);
      }
    },
  );

  /**
   * Consent Manager webhook stub: ingest CM events into ConsentRecord.
   * Auth: header `X-CM-Api-Key` must match organization.consentManagerWebhookSecret.
   */
  router.post(
    "/consent-webhook",
    validateBody(cmWebhookSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const body = req.body as z.infer<typeof cmWebhookSchema>;
        const apiKey = String(req.headers["x-cm-api-key"] ?? "");
        const org = await prisma.organization.findFirst({
          where: { id: body.organizationId, deletedAt: null },
          select: {
            id: true,
            consentManagerMode: true,
            consentManagerWebhookSecret: true,
          },
        });
        if (!org) throw new ValidationError("Organization not found");
        if (
          !org.consentManagerWebhookSecret ||
          !apiKey ||
          apiKey !== org.consentManagerWebhookSecret
        ) {
          throw new ValidationError("Invalid CM API key");
        }

        const ctx = publicCtx(
          org.id,
          (req.headers["x-correlation-id"] as string) || `cm-webhook-${Date.now()}`,
        );

        if (body.consentState === "WITHDRAWN") {
          // Find latest granted and withdraw — MVP: create withdrawn not supported; create then withdraw.
        }

        const record = await consentRecordService.create(ctx, {
          dataSubjectIdentifier: body.dataSubjectIdentifier,
          purpose: body.purpose,
          purposes: body.purposes,
          grantedAt: body.grantedAt,
          expiresAt: body.expiresAt,
        });

        sendSuccess(res, { id: record.id, consentState: record.consentState }, 201);
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
