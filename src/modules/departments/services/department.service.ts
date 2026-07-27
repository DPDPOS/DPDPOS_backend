import { NotFoundError } from "../../../shared/errors/app-error.js";
import { DepartmentRepository } from "../repositories/department.repository.js";

/**
 * Department service stub — full CRUD lands in feature/a/departments.
 */
export class DepartmentService {
  constructor(private readonly repo = new DepartmentRepository()) {}

  async notImplemented(operation: string): Promise<never> {
    void this.repo;
    throw new NotFoundError(`Department module: ${operation} is not implemented yet`);
  }
}

export const departmentService = new DepartmentService();
