import type { NextFunction, Response } from "express";
import { ForbiddenError } from "../../../shared/errors/app-error.js";
import { sendSuccess } from "../../../shared/middleware/response-envelope.middleware.js";
import { getCorrelationId } from "../../../shared/middleware/correlation-id.middleware.js";
import {
  getRequestContext,
  type AuthenticatedRequest,
} from "../../../shared/guards/auth.guard.js";
import type {
  CreateOrganizationDto,
  UpdateOrganizationDto,
} from "../dto/organization.dto.js";
import { organizationService } from "../services/organization.service.js";

export class OrganizationController {
  async create(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const body = req.body as CreateOrganizationDto;
      const result = await organizationService.create(body, {
        correlationId: getCorrelationId(),
      });
      sendSuccess(res, result, 201);
    } catch (err) {
      next(err);
    }
  }

  async getById(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const ctx = getRequestContext(req);
      const { id } = req.params as { id: string };
      if (ctx.organizationId !== id) {
        throw new ForbiddenError("Cannot access another organization");
      }
      const organization = await organizationService.getById(id);
      sendSuccess(res, organization);
    } catch (err) {
      next(err);
    }
  }

  async update(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const ctx = getRequestContext(req);
      const { id } = req.params as { id: string };
      if (ctx.organizationId !== id) {
        throw new ForbiddenError("Cannot update another organization");
      }
      const body = req.body as UpdateOrganizationDto;
      const organization = await organizationService.update(id, body, {
        actorUserId: ctx.actorUserId,
        correlationId: ctx.correlationId,
      });
      sendSuccess(res, organization);
    } catch (err) {
      next(err);
    }
  }
}

export const organizationController = new OrganizationController();
