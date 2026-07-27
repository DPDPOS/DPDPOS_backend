export { createRolesRouter } from "./routes/role.routes.js";
export { roleService } from "./services/role.service.js";
export { rolePermissions } from "./permissions/role.permissions.js";
export type { CreateRoleDto, UpdateRolePermissionsDto } from "./dto/role.dto.js";
export { RoleAssignedEventType, type RoleAssignedEvent } from "./events/role-assigned.event.js";
export {
  RolePermissionsChangedEventType,
  type RolePermissionsChangedEvent,
} from "./events/role-permissions-changed.event.js";
