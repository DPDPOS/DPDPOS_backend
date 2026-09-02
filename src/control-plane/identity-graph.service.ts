import { createHash } from "node:crypto";

import { prisma } from "../infrastructure/database/prisma-client.js";

function principalHash(principalRef: string): string {
  const normalized = principalRef.trim().toLowerCase();
  return /^[a-f0-9]{64}$/.test(normalized)
    ? normalized
    : createHash("sha256").update(normalized).digest("hex");
}

export class IdentityGraphService {
  async resolvePrincipal(organizationId: string, principalRef: string) {
    const identityHash = principalHash(principalRef);
    const edges = await prisma.identityGraphEdge.findMany({
      where: {
        organizationId,
        OR: [
          { sourceIdentityHash: identityHash },
          { targetIdentityHash: identityHash },
        ],
      },
      include: {
        system: {
          select: {
            id: true,
            externalId: true,
            name: true,
            systemType: true,
          },
        },
      },
      orderBy: { lastSeenAt: "desc" },
    });

    return {
      principalHash: identityHash,
      matches: edges.map((edge) => ({
        edgeId: edge.id,
        edgeType: edge.edgeType,
        confidence: edge.confidence,
        system: edge.system,
        evidence: edge.evidenceJson,
        relatedIdentityHash:
          edge.sourceIdentityHash === identityHash
            ? edge.targetIdentityHash
            : edge.sourceIdentityHash,
        lastSeenAt: edge.lastSeenAt,
      })),
    };
  }
}

export const identityGraphService = new IdentityGraphService();
