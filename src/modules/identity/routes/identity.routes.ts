import { Router } from "express";
import { authenticate } from "../../../shared/middleware/authenticate.middleware.js";
import { requirePermission } from "../../../shared/guards/permission.guard.js";
import { identityPermissions } from "../permissions/identity.permissions.js";
import { identityController } from "../controllers/identity.controller.js";

/** Public + session federation routes under /api/v1/auth/... */
export function createIdentityAuthRouter(): Router {
  const router = Router();

  router.get(
    "/identity/options",
    (req, res, next) => void identityController.publicOptions(req, res, next),
  );

  router.get(
    "/oidc/start",
    (req, res, next) => void identityController.oidcStart(req, res, next),
  );

  router.get(
    "/oidc/callback",
    (req, res, next) => void identityController.oidcCallback(req, res, next),
  );

  router.post(
    "/oidc/exchange",
    (req, res, next) => void identityController.oidcExchange(req, res, next),
  );

  router.post(
    "/ldap/login",
    (req, res, next) => void identityController.ldapLogin(req, res, next),
  );

  return router;
}

/** Admin identity configuration under /api/v1/identity/... */
export function createIdentityAdminRouter(): Router {
  const router = Router();

  router.get(
    "/settings",
    authenticate,
    requirePermission(identityPermissions.read),
    (req, res, next) => void identityController.getSettings(req, res, next),
  );

  router.patch(
    "/settings",
    authenticate,
    requirePermission(identityPermissions.update),
    (req, res, next) => void identityController.updateSettings(req, res, next),
  );

  router.get(
    "/providers",
    authenticate,
    requirePermission(identityPermissions.read),
    (req, res, next) => void identityController.listProviders(req, res, next),
  );

  router.post(
    "/providers",
    authenticate,
    requirePermission(identityPermissions.update),
    (req, res, next) => void identityController.createProvider(req, res, next),
  );

  router.patch(
    "/providers/:providerId",
    authenticate,
    requirePermission(identityPermissions.update),
    (req, res, next) => void identityController.updateProvider(req, res, next),
  );

  router.delete(
    "/providers/:providerId",
    authenticate,
    requirePermission(identityPermissions.update),
    (req, res, next) => void identityController.deleteProvider(req, res, next),
  );

  router.get(
    "/group-maps",
    authenticate,
    requirePermission(identityPermissions.read),
    (req, res, next) => void identityController.listGroupMaps(req, res, next),
  );

  router.post(
    "/group-maps",
    authenticate,
    requirePermission(identityPermissions.update),
    (req, res, next) => void identityController.createGroupMap(req, res, next),
  );

  router.delete(
    "/group-maps/:mapId",
    authenticate,
    requirePermission(identityPermissions.update),
    (req, res, next) => void identityController.deleteGroupMap(req, res, next),
  );

  router.post(
    "/sync",
    authenticate,
    requirePermission(identityPermissions.sync),
    (req, res, next) => void identityController.syncDirectory(req, res, next),
  );

  router.post(
    "/entra/group-scopes",
    authenticate,
    requirePermission(identityPermissions.update),
    (req, res, next) => void identityController.enableEntraGroupScopes(req, res, next),
  );

  return router;
}
