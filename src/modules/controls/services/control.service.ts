import { NotFoundError } from "../../../shared/errors/app-error.js";
import { ControlRepository } from "../repositories/control.repository.js";

/**
 * Control service stub — full CRUD lands in feature/a/controls.
 */
export class ControlService {
  constructor(private readonly repo = new ControlRepository()) {}

  async notImplemented(operation: string): Promise<never> {
    void this.repo;
    throw new NotFoundError(`Control module: ${operation} is not implemented yet`);
  }
}

export const controlService = new ControlService();
