import { NotFoundError } from "../../../shared/errors/app-error.js";
import { FrameworkRepository } from "../repositories/framework.repository.js";

/**
 * Framework service stub — full generation/roadmap logic lands in feature/a/framework.
 */
export class FrameworkService {
  constructor(private readonly repo = new FrameworkRepository()) {}

  async notImplemented(operation: string): Promise<never> {
    void this.repo;
    throw new NotFoundError(`Framework module: ${operation} is not implemented yet`);
  }
}

export const frameworkService = new FrameworkService();
