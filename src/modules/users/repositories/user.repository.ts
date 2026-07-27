import { BaseRepository } from "../../../shared/repository/base.repository.js";
import { prisma } from "../../../infrastructure/database/prisma-client.js";
import type { TenantScopedQuery } from "../../../shared/types/request-context.js";

export class UserRepository extends BaseRepository {
  async findById(query: TenantScopedQuery & { id: string }) {
    const where = this.tenantWhere(query);
    return prisma.user.findFirst({
      where: {
        id: query.id,
        ...where,
      },
    });
  }
}
