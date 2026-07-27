import type { NextFunction, Request, Response } from "express";
import { organizationService } from "../services/organization.service.js";

export class OrganizationController {
  async stub(req: Request, _res: Response, next: NextFunction): Promise<void> {
    try {
      await organizationService.notImplemented(`${req.method} ${req.path}`);
    } catch (err) {
      next(err);
    }
  }
}

export const organizationController = new OrganizationController();
