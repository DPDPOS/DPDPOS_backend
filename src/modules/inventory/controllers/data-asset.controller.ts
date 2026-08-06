import type { NextFunction, Response } from "express";

import { sendSuccess } from "../../../shared/middleware/response-envelope.middleware.js";
import {
  getRequestContext,
  type AuthenticatedRequest,
} from "../../../shared/guards/auth.guard.js";

import type {
  CreateDataAssetDto,
  UpdateDataAssetDto,
} from "../dto/data-asset.dto.js";

import { dataAssetService } from "../services/data-asset.service.js";

export class DataAssetController {
  async create(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const ctx = getRequestContext(req);
      const body = req.body as CreateDataAssetDto;

      const asset = await dataAssetService.create(ctx, body);

      sendSuccess(res, asset, 201);
    } catch (err) {
      next(err);
    }
  }

  async list(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const ctx = getRequestContext(req);

      const assets = await dataAssetService.list(ctx);

      sendSuccess(res, assets);
    } catch (err) {
      next(err);
    }
  }

  async getById(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const ctx = getRequestContext(req);

      const { id } = req.params as { id: string };

      const asset = await dataAssetService.getById(ctx, id);

      sendSuccess(res, asset);
    } catch (err) {
      next(err);
    }
  }

  async update(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const ctx = getRequestContext(req);

      const { id } = req.params as { id: string };

      const body = req.body as UpdateDataAssetDto;

      const asset = await dataAssetService.update(
        ctx,
        id,
        body,
      );

      sendSuccess(res, asset);
    } catch (err) {
      next(err);
    }
  }

  async archive(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const ctx = getRequestContext(req);

      const { id } = req.params as { id: string };

      const asset = await dataAssetService.archive(
        ctx,
        id,
      );

      sendSuccess(res, asset);
    } catch (err) {
      next(err);
    }
  }
}

export const dataAssetController =
  new DataAssetController();