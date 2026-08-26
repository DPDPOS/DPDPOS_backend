import type { NextFunction, Response } from "express";
import type { AuthenticatedRequest } from "../../../shared/types/authenticated-request.js";
import { sendSuccess } from "../../../shared/middleware/response-envelope.middleware.js";
import { vendorService } from "../services/vendor.service.js";
import type {
  CreateVendorDto,
  CreateVendorAgreementDto,
  CreateVendorRelationshipDto,
  CreateVendorReviewDto,
  UpdateVendorDto,
} from "../dto/vendor.dto.js";

export class VendorController {
  async create(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const vendor = await vendorService.create(
        req.context!,
        req.body as CreateVendorDto,
      );
      sendSuccess(res, vendor, 201);
    } catch (err) {
      next(err);
    }
  }

  async list(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const vendors = await vendorService.list(req.context!, {
        status: req.query.status as string | undefined,
        criticality: req.query.criticality as string | undefined,
        vendorType: req.query.vendorType as string | undefined,
      });
      sendSuccess(res, vendors);
    } catch (err) {
      next(err);
    }
  }

  async getById(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const vendor = await vendorService.getById(
        req.context!,
        req.params.id as string,
      );
      sendSuccess(res, vendor);
    } catch (err) {
      next(err);
    }
  }

  async update(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const vendor = await vendorService.update(
        req.context!,
        req.params.id as string,
        req.body as UpdateVendorDto,
      );
      sendSuccess(res, vendor);
    } catch (err) {
      next(err);
    }
  }

  async offboard(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const vendor = await vendorService.offboard(
        req.context!,
        req.params.id as string,
      );
      sendSuccess(res, vendor);
    } catch (err) {
      next(err);
    }
  }

  async getRisk(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const risk = await vendorService.getRisk(
        req.context!,
        req.params.id as string,
      );
      sendSuccess(res, risk);
    } catch (err) {
      next(err);
    }
  }

  async createAgreement(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const agreement = await vendorService.createAgreement(
        req.context!,
        req.params.id as string,
        req.body as CreateVendorAgreementDto,
      );
      sendSuccess(res, agreement, 201);
    } catch (err) {
      next(err);
    }
  }

  async listAgreements(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const agreements = await vendorService.listAgreements(
        req.context!,
        req.params.id as string,
      );
      sendSuccess(res, agreements);
    } catch (err) {
      next(err);
    }
  }

  async createReview(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const review = await vendorService.createReview(
        req.context!,
        req.params.id as string,
        req.body as CreateVendorReviewDto,
      );
      sendSuccess(res, review, 201);
    } catch (err) {
      next(err);
    }
  }

  async listReviews(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const reviews = await vendorService.listReviews(
        req.context!,
        req.params.id as string,
      );
      sendSuccess(res, reviews);
    } catch (err) {
      next(err);
    }
  }

  async addRelationship(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const rel = await vendorService.addRelationship(
        req.context!,
        req.params.id as string,
        req.body as CreateVendorRelationshipDto,
      );
      sendSuccess(res, rel, 201);
    } catch (err) {
      next(err);
    }
  }

  async listRelationships(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const rows = await vendorService.listRelationships(
        req.context!,
        req.params.id as string,
      );
      sendSuccess(res, rows);
    } catch (err) {
      next(err);
    }
  }

  async acknowledgeRelationship(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const row = await vendorService.acknowledgeRelationship(
        req.context!,
        req.params.id as string,
        (req.body as { relationshipId: string }).relationshipId,
      );
      sendSuccess(res, row);
    } catch (err) {
      next(err);
    }
  }

  async createCliToken(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const data = await vendorService.createCliToken(
        req.context!,
        req.body as import("../dto/vendor.dto.js").CreateVendorCliTokenDto,
      );
      sendSuccess(res, data, 201);
    } catch (err) {
      next(err);
    }
  }

  async syncFromCli(
    req: import("../../assessments/middleware/authenticate-cli.middleware.js").CliAuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const {
        getCliContext,
      } = await import(
        "../../assessments/middleware/authenticate-cli.middleware.js"
      );
      const data = await vendorService.syncFromCli(
        getCliContext(req),
        req.body as import("../dto/vendor.dto.js").VendorCliSyncDto,
      );
      sendSuccess(res, data, 201);
    } catch (err) {
      next(err);
    }
  }
}

export const vendorController = new VendorController();
