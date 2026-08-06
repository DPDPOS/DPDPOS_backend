import { PERMISSIONS } from "../../../shared/constants/permissions.js";

export const notificationPermissions = {
  read: (PERMISSIONS as any).NOTIFICATION_READ ?? 'notification:read',
  updatePreferences: (PERMISSIONS as any).NOTIFICATION_PREFERENCES_UPDATE ?? 'notification:update_preferences',
} as const;
