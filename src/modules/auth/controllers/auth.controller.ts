import type { NextFunction, Request, Response } from "express";
import { authService } from "../services/auth.service.js";

export class AuthController {
  async stub(req: Request, _res: Response, next: NextFunction): Promise<void> {
    try {
      await authService.notImplemented(`${req.method} ${req.path}`);
    } catch (err) {
      next(err);
    }
  }
}

export const authController = new AuthController();
