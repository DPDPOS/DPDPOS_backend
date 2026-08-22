import { Router } from "express";
import { authenticate } from "../../shared/middleware/authenticate.middleware.js";
import {
  validateBody,
  validateParams,
  validateQuery,
} from "../../shared/middleware/validate.middleware.js";
import { requirePermission } from "../../shared/guards/permission.guard.js";
import { vendorController } from "./controllers/vendor.controller.js";
import { vendorPermissions } from "./permissions/vendor.permissions.js";
import {
  acknowledgeRelationshipDtoSchema,
  createVendorAgreementDtoSchema,
  createVendorDtoSchema,
  createVendorRelationshipDtoSchema,
  createVendorReviewDtoSchema,
  listVendorsQuerySchema,
  updateVendorDtoSchema,
  vendorIdParamSchema,
} from "./dto/vendor.dto.js";

export function createVendorRouter(): Router {
  const router = Router();

  router.post(
    "/",
    authenticate,
    requirePermission(vendorPermissions.create),
    validateBody(createVendorDtoSchema),
    (req, res, next) => void vendorController.create(req, res, next),
  );

  router.get(
    "/",
    authenticate,
    requirePermission(vendorPermissions.read),
    validateQuery(listVendorsQuerySchema),
    (req, res, next) => void vendorController.list(req, res, next),
  );

  router.get(
    "/:id",
    authenticate,
    requirePermission(vendorPermissions.read),
    validateParams(vendorIdParamSchema),
    (req, res, next) => void vendorController.getById(req, res, next),
  );

  router.patch(
    "/:id",
    authenticate,
    requirePermission(vendorPermissions.update),
    validateParams(vendorIdParamSchema),
    validateBody(updateVendorDtoSchema),
    (req, res, next) => void vendorController.update(req, res, next),
  );

  router.post(
    "/:id/offboard",
    authenticate,
    requirePermission(vendorPermissions.offboard),
    validateParams(vendorIdParamSchema),
    (req, res, next) => void vendorController.offboard(req, res, next),
  );

  router.get(
    "/:id/risk",
    authenticate,
    requirePermission(vendorPermissions.read),
    validateParams(vendorIdParamSchema),
    (req, res, next) => void vendorController.getRisk(req, res, next),
  );

  router.post(
    "/:id/agreements",
    authenticate,
    requirePermission(vendorPermissions.update),
    validateParams(vendorIdParamSchema),
    validateBody(createVendorAgreementDtoSchema),
    (req, res, next) => void vendorController.createAgreement(req, res, next),
  );

  router.get(
    "/:id/agreements",
    authenticate,
    requirePermission(vendorPermissions.read),
    validateParams(vendorIdParamSchema),
    (req, res, next) => void vendorController.listAgreements(req, res, next),
  );

  router.post(
    "/:id/reviews",
    authenticate,
    requirePermission(vendorPermissions.review),
    validateParams(vendorIdParamSchema),
    validateBody(createVendorReviewDtoSchema),
    (req, res, next) => void vendorController.createReview(req, res, next),
  );

  router.get(
    "/:id/reviews",
    authenticate,
    requirePermission(vendorPermissions.read),
    validateParams(vendorIdParamSchema),
    (req, res, next) => void vendorController.listReviews(req, res, next),
  );

  router.post(
    "/:id/relationships",
    authenticate,
    requirePermission(vendorPermissions.update),
    validateParams(vendorIdParamSchema),
    validateBody(createVendorRelationshipDtoSchema),
    (req, res, next) => void vendorController.addRelationship(req, res, next),
  );

  router.get(
    "/:id/relationships",
    authenticate,
    requirePermission(vendorPermissions.read),
    validateParams(vendorIdParamSchema),
    (req, res, next) => void vendorController.listRelationships(req, res, next),
  );

  router.post(
    "/:id/relationships/acknowledge",
    authenticate,
    requirePermission(vendorPermissions.review),
    validateParams(vendorIdParamSchema),
    validateBody(acknowledgeRelationshipDtoSchema),
    (req, res, next) =>
      void vendorController.acknowledgeRelationship(req, res, next),
  );

  return router;
}

export const vendorsModule = { name: "vendors" } as const;
