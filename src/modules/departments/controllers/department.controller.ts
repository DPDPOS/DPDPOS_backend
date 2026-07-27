import type { NextFunction, Request, Response } from "express";
import { departmentService } from "../services/department.service.js";

export class DepartmentController {
  async stub(req: Request, _res: Response, next: NextFunction): Promise<void> {
    try {
      await departmentService.notImplemented(`${req.method} ${req.path}`);
    } catch (err) {
      next(err);
    }
  }
}

export const departmentController = new DepartmentController();
