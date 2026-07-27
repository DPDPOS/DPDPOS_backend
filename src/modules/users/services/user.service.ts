import { NotFoundError } from "../../../shared/errors/app-error.js";
import { UserRepository } from "../repositories/user.repository.js";

/**
 * User service stub — full CRUD lands in feature/a/users.
 */
export class UserService {
  constructor(private readonly repo = new UserRepository()) {}

  async notImplemented(operation: string): Promise<never> {
    void this.repo;
    throw new NotFoundError(`User module: ${operation} is not implemented yet`);
  }
}

export const userService = new UserService();
