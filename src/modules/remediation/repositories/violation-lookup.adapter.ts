import { prisma } from "../../../infrastructure/database/prisma-client.js";
import type { ViolationLookup } from "../interfaces/violation-lookup.interface.js";

/** Tenant-scoped read of the `violations` table for linkage validation. */
export class PrismaViolationLookup implements ViolationLookup {
  async findById(
    organizationId: string,
    violationId: string,
  ): Promise<{ id: string } | null> {
    const row = await prisma.violation.findFirst({
      where: {
        id: violationId,
        organizationId,
        deletedAt: null,
      },
      select: { id: true },
    });
    return row;
  }
}
