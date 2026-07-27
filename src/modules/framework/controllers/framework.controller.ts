import type { NextFunction, Request, Response } from "express";
import { frameworkService } from "../services/framework.service.js";

export class FrameworkController {
  async stub(req: Request, _res: Response, next: NextFunction): Promise<void> {
    try {
      await frameworkService.notImplemented(`${req.method} ${req.path}`);
    } catch (err) {
      next(err);
    }
  }
}

export const frameworkController = new FrameworkController();
