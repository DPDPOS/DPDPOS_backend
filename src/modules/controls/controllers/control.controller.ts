import type { NextFunction, Request, Response } from "express";
import { controlService } from "../services/control.service.js";

export class ControlController {
  async stub(req: Request, _res: Response, next: NextFunction): Promise<void> {
    try {
      await controlService.notImplemented(`${req.method} ${req.path}`);
    } catch (err) {
      next(err);
    }
  }
}

export const controlController = new ControlController();
