import { BaseRepository } from "../../../shared/repository/base.repository.js";
import { prisma } from "../../../infrastructure/database/prisma-client.js";
import type { TenantScopedQuery } from "../../../shared/types/request-context.js";

export class AuthRepository extends BaseRepository {
  async findUserByEmail(query: TenantScopedQuery & { email: string }) {
    const where = this.tenantWhere(query);
    return prisma.user.findFirst({
      where: {
        email: query.email,
        ...where,
      },
    });
  }
}
