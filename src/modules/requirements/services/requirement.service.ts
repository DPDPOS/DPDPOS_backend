import { NotFoundError } from "../../../shared/errors/app-error.js";
import { RequirementRepository } from "../repositories/requirement.repository.js";

/**
 * Requirement service stub — full CRUD lands in feature/a/requirements.
 */
export class RequirementService {
  constructor(private readonly repo = new RequirementRepository()) {}

  async notImplemented(operation: string): Promise<never> {
    void this.repo;
    throw new NotFoundError(`Requirement module: ${operation} is not implemented yet`);
  }
}

export const requirementService = new RequirementService();
