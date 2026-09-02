import type { NextFunction, Response } from "express";
import type { AuthenticatedRequest } from "../../../shared/types/authenticated-request.js";
import { sendSuccess } from "../../../shared/middleware/response-envelope.middleware.js";
import type { AgentIntakeDto } from "./agent-intake.dto.js";
import { agentIntakeService } from "./agent-intake.service.js";

export class AgentIntakeController {
  async intake(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      sendSuccess(
        res,
        await agentIntakeService.intake(
          req.context!,
          req.body as AgentIntakeDto,
        ),
        201,
      );
    } catch (error) {
      next(error);
    }
  }
}

export const agentIntakeController = new AgentIntakeController();
