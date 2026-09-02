import { randomUUID, X509Certificate } from "node:crypto";
import { hashToken } from "../../auth/utils/token-crypto.js";
import { withTransaction } from "../../../infrastructure/database/transaction-manager.js";
import { writeOutboxEvent } from "../../../events/outbox/outbox.repository.js";
import {
  ForbiddenError,
  UnauthorizedError,
} from "../../../shared/errors/app-error.js";
import type { EnrollAgentDto } from "../dto/agent.dto.js";
import { agentDb, type AgentPrismaClient } from "../types/agent.types.js";
import { platformCaService } from "./platform-ca.service.js";

export class EnrollmentService {
  async enroll(input: EnrollAgentDto) {
    const tokenHash = hashToken(input.enrollmentToken);
    const token = await agentDb.agentEnrollmentToken.findUnique({
      where: { tokenHash },
    });
    if (!token || token.useCount >= token.maxUses || token.revokedAt) {
      throw new UnauthorizedError("Invalid or already-used enrollment token");
    }
    if (new Date(token.expiresAt).getTime() <= Date.now()) {
      throw new UnauthorizedError("Enrollment token expired");
    }

    const scopeProfile = token.scopeProfileJson ?? token.scopeJson ?? {};
    const allowedZone = scopeProfile.zoneName ?? token.zoneName;
    if (allowedZone && input.zoneName && allowedZone !== input.zoneName) {
      throw new ForbiddenError("Enrollment token is not valid for this zone");
    }

    const signed = await platformCaService.signCsr(input.csrPem);
    const result = await withTransaction(async (tx) => {
      const db = tx as unknown as AgentPrismaClient;
      const agent = await db.agent.create({
        data: {
          organizationId: token.organizationId,
          enrollmentTokenId: token.id,
          name: input.agentName ?? `agent-${token.tokenPrefix}`,
          state: "ACTIVE",
          agentVersion: input.agentVersion,
          instanceKey: input.instanceKey ?? randomUUID(),
          platform: input.platform,
          hostname: input.hostname,
          scopeProfileJson: scopeProfile,
          capabilitiesJson: input.capabilities,
          enrolledAt: new Date(),
        },
      });
      await db.agentCertificate.create({
        data: {
          agentId: agent.id,
          serialNumber: signed.serialNumber,
          fingerprintSha256: new X509Certificate(signed.certPem)
            .fingerprint256.replaceAll(":", "")
            .toLowerCase(),
          certificatePem: signed.certPem,
          issuedAt: new Date(),
          expiresAt: signed.expiresAt,
        },
      });
      const consumed = await db.agentEnrollmentToken.updateMany({
        where: { id: token.id, useCount: { lt: token.maxUses } },
        data: { useCount: { increment: 1 }, lastUsedAt: new Date() },
      });
      if (consumed.count !== 1) {
        throw new UnauthorizedError("Enrollment token was already consumed");
      }
      await writeOutboxEvent(tx, {
        eventType: "AgentEnrolled",
        organizationId: token.organizationId,
        correlationId: agent.id,
        payload: {
          agentId: agent.id,
          zoneName: input.zoneName ?? allowedZone ?? "default",
        },
      });
      return agent;
    });

    return {
      clientCertPem: signed.certPem,
      caCertPem: await platformCaService.getCaCertPem(),
      agentId: result.id,
      scopeProfile,
    };
  }
}

export const enrollmentService = new EnrollmentService();
