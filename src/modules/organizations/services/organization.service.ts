import { NotFoundError } from "../../../shared/errors/app-error.js";
import { OrganizationRepository } from "../repositories/organization.repository.js";

/**
 * Organization service stub — full CRUD lands in feature/a/organizations.
 */
export class OrganizationService {
  constructor(private readonly repo = new OrganizationRepository()) {}

  async notImplemented(operation: string): Promise<never> {
    void this.repo;
    throw new NotFoundError(`Organization module: ${operation} is not implemented yet`);
  }
}

export const organizationService = new OrganizationService();
