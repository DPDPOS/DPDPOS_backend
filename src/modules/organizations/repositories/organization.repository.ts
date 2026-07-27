import { BaseRepository } from "../../../shared/repository/base.repository.js";
import { prisma } from "../../../infrastructure/database/prisma-client.js";

export class OrganizationRepository extends BaseRepository {
  async findById(id: string) {
    return prisma.organization.findFirst({
      where: {
        id,
        deletedAt: null,
      },
    });
  }
}
