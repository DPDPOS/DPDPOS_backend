export { createDepartmentsRouter } from "./routes/department.routes.js";
export { departmentService } from "./services/department.service.js";
export { departmentPermissions } from "./permissions/department.permissions.js";
export type { CreateDepartmentDto } from "./dto/department.dto.js";
export type { DepartmentResponse } from "./types/department.types.js";
export {
  DepartmentCreatedEventType,
  type DepartmentCreatedEvent,
} from "./events/department-created.event.js";
