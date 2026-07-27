import { NotFoundError } from "../../../shared/errors/app-error.js";
import { AuthRepository } from "../repositories/auth.repository.js";

/**
 * Auth service stub — full login/session flow lands in feature/a/auth.
 */
export class AuthService {
  constructor(private readonly repo = new AuthRepository()) {}

  async notImplemented(operation: string): Promise<never> {
    void this.repo;
    throw new NotFoundError(`Auth module: ${operation} is not implemented yet`);
  }
}

export const authService = new AuthService();
