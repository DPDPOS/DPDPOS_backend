import { Router } from "express";
import { authenticate } from "../../../shared/middleware/authenticate.middleware.js";
import { validateBody, validateParams, validateQuery } from "../../../shared/middleware/validate.middleware.js";
import { requirePermission } from "../../../shared/guards/permission.guard.js";
import { notificationController } from "../controllers/notification.controller.js";
import { notificationPermissions } from "../permissions/notification.permissions.js";
import { listNotificationsQuerySchema, notificationIdParamSchema, updatePreferencesDtoSchema } from "../dto/notification.dto.js";

export function createNotificationRouter(): Router {
  const router = Router();
  
  router.get("/", authenticate, requirePermission(notificationPermissions.read), validateQuery(listNotificationsQuerySchema),
    (req, res, next) => void notificationController.list(req, res, next));
    
  router.get("/unread-count", authenticate, requirePermission(notificationPermissions.read),
    (req, res, next) => void notificationController.getUnreadCount(req, res, next));
    
  router.patch("/:id/read", authenticate, requirePermission(notificationPermissions.read), validateParams(notificationIdParamSchema),
    (req, res, next) => void notificationController.markRead(req, res, next));
    
  router.patch("/read-all", authenticate, requirePermission(notificationPermissions.read),
    (req, res, next) => void notificationController.markAllRead(req, res, next));

  router.get("/preferences", authenticate, requirePermission(notificationPermissions.read),
    (req, res, next) => void notificationController.getPreferences(req, res, next));

  router.put("/preferences", authenticate, requirePermission(notificationPermissions.updatePreferences), validateBody(updatePreferencesDtoSchema),
    (req, res, next) => void notificationController.updatePreferences(req, res, next));
    
  return router;
}
