import type { NextFunction, Request, Response } from "express";
import { roleService } from "../services/role.service.js";

export class RoleController {
  async stub(req: Request, _res: Response, next: NextFunction): Promise<void> {
    try {
      await roleService.notImplemented(`${req.method} ${req.path}`);
    } catch (err) {
      next(err);
    }
  }
}

export const roleController = new RoleController();
