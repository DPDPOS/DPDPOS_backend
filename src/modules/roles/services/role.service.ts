import { NotFoundError } from "../../../shared/errors/app-error.js";
import { RoleRepository } from "../repositories/role.repository.js";

/**
 * Role service stub — full CRUD lands in feature/a/roles.
 */
export class RoleService {
  constructor(private readonly repo = new RoleRepository()) {}

  async notImplemented(operation: string): Promise<never> {
    void this.repo;
    throw new NotFoundError(`Role module: ${operation} is not implemented yet`);
  }
}

export const roleService = new RoleService();
