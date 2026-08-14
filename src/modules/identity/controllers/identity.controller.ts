import type { NextFunction, Request, Response } from "express";
import { sendSuccess } from "../../../shared/middleware/response-envelope.middleware.js";
import { getRequestContext } from "../../../shared/guards/auth.guard.js";
import { ValidationError } from "../../../shared/errors/app-error.js";
import {
  createGroupRoleMapDtoSchema,
  ldapLoginDtoSchema,
  oidcExchangeDtoSchema,
  updateIdentitySettingsDtoSchema,
  upsertIdentityProviderDtoSchema,
} from "../dto/identity.dto.js";
import { identitySettingsService } from "../services/identity-settings.service.js";
import { identityAdminService } from "../services/identity-admin.service.js";
import { oidcService } from "../services/oidc.service.js";
import { ldapService } from "../services/ldap.service.js";

function metaFrom(req: Request) {
  return {
    userAgent: req.get("user-agent") ?? undefined,
    ipAddress: req.ip,
    correlationId: (req as { correlationId?: string }).correlationId,
  };
}

export const identityController = {
  async publicOptions(req: Request, res: Response, next: NextFunction) {
    try {
      const organizationId = String(req.query.organizationId ?? "");
      if (!organizationId) {
        throw new ValidationError("organizationId query parameter is required");
      }
      const data = await identitySettingsService.getPublicOptions(organizationId);
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  },

  async getSettings(req: Request, res: Response, next: NextFunction) {
    try {
      const ctx = getRequestContext(req);
      const data = await identitySettingsService.getOrCreate(ctx.organizationId);
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  },

  async updateSettings(req: Request, res: Response, next: NextFunction) {
    try {
      const ctx = getRequestContext(req);
      const dto = updateIdentitySettingsDtoSchema.parse(req.body);
      const data = await identitySettingsService.update(ctx.organizationId, dto);
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  },

  async listProviders(req: Request, res: Response, next: NextFunction) {
    try {
      const ctx = getRequestContext(req);
      sendSuccess(res, await identityAdminService.listProviders(ctx.organizationId));
    } catch (err) {
      next(err);
    }
  },

  async createProvider(req: Request, res: Response, next: NextFunction) {
    try {
      const ctx = getRequestContext(req);
      const dto = upsertIdentityProviderDtoSchema.parse(req.body);
      const data = await identityAdminService.upsertProvider(ctx.organizationId, dto);
      sendSuccess(res, data, 201);
    } catch (err) {
      next(err);
    }
  },

  async updateProvider(req: Request, res: Response, next: NextFunction) {
    try {
      const ctx = getRequestContext(req);
      const dto = upsertIdentityProviderDtoSchema.parse(req.body);
      const data = await identityAdminService.upsertProvider(
        ctx.organizationId,
        dto,
        String(req.params.providerId),
      );
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  },

  async deleteProvider(req: Request, res: Response, next: NextFunction) {
    try {
      const ctx = getRequestContext(req);
      sendSuccess(
        res,
        await identityAdminService.deleteProvider(
          ctx.organizationId,
          String(req.params.providerId),
        ),
      );
    } catch (err) {
      next(err);
    }
  },

  async listGroupMaps(req: Request, res: Response, next: NextFunction) {
    try {
      const ctx = getRequestContext(req);
      const providerId = req.query.providerId
        ? String(req.query.providerId)
        : undefined;
      sendSuccess(
        res,
        await identityAdminService.listGroupMaps(ctx.organizationId, providerId),
      );
    } catch (err) {
      next(err);
    }
  },

  async createGroupMap(req: Request, res: Response, next: NextFunction) {
    try {
      const ctx = getRequestContext(req);
      const dto = createGroupRoleMapDtoSchema.parse(req.body);
      sendSuccess(
        res,
        await identityAdminService.createGroupMap(ctx.organizationId, dto),
        201,
      );
    } catch (err) {
      next(err);
    }
  },

  async deleteGroupMap(req: Request, res: Response, next: NextFunction) {
    try {
      const ctx = getRequestContext(req);
      sendSuccess(
        res,
        await identityAdminService.deleteGroupMap(
          ctx.organizationId,
          String(req.params.mapId),
        ),
      );
    } catch (err) {
      next(err);
    }
  },

  async oidcStart(req: Request, res: Response, next: NextFunction) {
    try {
      const organizationId = String(req.query.organizationId ?? "");
      if (!organizationId) {
        throw new ValidationError("organizationId query parameter is required");
      }
      const { authorizationUrl } = await oidcService.start(organizationId);
      sendSuccess(res, { authorizationUrl });
    } catch (err) {
      next(err);
    }
  },

  async oidcCallback(req: Request, res: Response, next: NextFunction) {
    try {
      const { redirectUrl } = await oidcService.handleCallback({
        code: req.query.code ? String(req.query.code) : undefined,
        state: req.query.state ? String(req.query.state) : undefined,
        ...metaFrom(req),
      });
      res.redirect(302, redirectUrl);
    } catch (err) {
      next(err);
    }
  },

  async oidcExchange(req: Request, res: Response, next: NextFunction) {
    try {
      const dto = oidcExchangeDtoSchema.parse(req.body);
      sendSuccess(res, await oidcService.exchange(dto.exchangeCode));
    } catch (err) {
      next(err);
    }
  },

  async ldapLogin(req: Request, res: Response, next: NextFunction) {
    try {
      const dto = ldapLoginDtoSchema.parse(req.body);
      sendSuccess(res, await ldapService.login(dto, metaFrom(req)));
    } catch (err) {
      next(err);
    }
  },
};
