import type { NextFunction, Request, Response } from "express";
import { requirementService } from "../services/requirement.service.js";

export class RequirementController {
  async stub(req: Request, _res: Response, next: NextFunction): Promise<void> {
    try {
      await requirementService.notImplemented(`${req.method} ${req.path}`);
    } catch (err) {
      next(err);
    }
  }
}

export const requirementController = new RequirementController();
