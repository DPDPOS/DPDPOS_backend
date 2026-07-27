import type { NextFunction, Request, Response } from "express";
import { sendSuccess } from "../../../shared/middleware/response-envelope.middleware.js";
import { getCorrelationId } from "../../../shared/middleware/correlation-id.middleware.js";
import type {
  CreateOrganizationDto,
  UpdateOrganizationDto,
} from "../dto/organization.dto.js";
import { organizationService } from "../services/organization.service.js";

export class OrganizationController {
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
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

  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params as { id: string };
      const organization = await organizationService.getById(id);
      sendSuccess(res, organization);
    } catch (err) {
      next(err);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params as { id: string };
      const body = req.body as UpdateOrganizationDto;
      const organization = await organizationService.update(id, body, {
        correlationId: getCorrelationId(),
      });
      sendSuccess(res, organization);
    } catch (err) {
      next(err);
    }
  }
}

export const organizationController = new OrganizationController();
