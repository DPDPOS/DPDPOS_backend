import { prisma } from "../../../infrastructure/database/prisma-client.js";
import type { UserLookup } from "../interfaces/user-lookup.interface.js";

/** Stub user-lookup adapter — tenant-scoped read of the `users` table. */
export class PrismaUserLookup implements UserLookup {
  async existsInOrganization(
    organizationId: string,
    userId: string,
  ): Promise<boolean> {
    const row = await prisma.user.findFirst({
      where: {
        id: userId,
        organizationId,
        deletedAt: null,
      },
      select: { id: true },
    });
    return row !== null;
  }
}
