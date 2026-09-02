import type { NextFunction, Response } from "express";
import { getRequestContext, type AuthenticatedRequest } from "../../../shared/guards/auth.guard.js";
import { sendSuccess } from "../../../shared/middleware/response-envelope.middleware.js";
import { getAgentContext } from "../../agents/middleware/authenticate-agent.middleware.js";
import type { AgentAuthenticatedRequest } from "../../agents/types/agent.types.js";
import {
  pluginRegistryService,
  type PublishPluginInput,
} from "../services/plugin-registry.service.js";

export class PluginController {
  async publish(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      sendSuccess(
        res,
        await pluginRegistryService.publishPlugin(
          getRequestContext(req),
          req.body as PublishPluginInput,
        ),
        201,
      );
    } catch (error) {
      next(error);
    }
  }

  async list(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const ctx = getRequestContext(req);
      sendSuccess(res, await pluginRegistryService.listPlugins(ctx.organizationId));
    } catch (error) {
      next(error);
    }
  }

  async download(
    req: AgentAuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const ctx = getAgentContext(req);
      const { plugin, bytes } = await pluginRegistryService.getPluginBytes(
        ctx.organizationId,
        req.params.id as string,
      );
      res.setHeader("Content-Type", "application/wasm");
      res.setHeader("Content-Length", String(bytes.length));
      res.setHeader("ETag", `"${plugin.artifactSha256}"`);
      res.status(200).send(bytes);
    } catch (error) {
      next(error);
    }
  }
}

export const pluginController = new PluginController();
