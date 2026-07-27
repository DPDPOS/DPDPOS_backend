import type { NextFunction, Request, Response } from "express";
import { userService } from "../services/user.service.js";

export class UserController {
  async stub(req: Request, _res: Response, next: NextFunction): Promise<void> {
    try {
      await userService.notImplemented(`${req.method} ${req.path}`);
    } catch (err) {
      next(err);
    }
  }
}

export const userController = new UserController();
