import type {
  FindingSeverity,
  FindingSource,
  FindingStatus,
  Prisma,
} from "@prisma/client";

import { writeOutboxEvent } from "../events/outbox/outbox.repository.js";
import { DOMAIN_EVENTS } from "../events/types/base-event.interface.js";
import { withTransaction } from "../infrastructure/database/transaction-manager.js";
import { prisma } from "../infrastructure/database/prisma-client.js";

export type UpsertComplianceFindingInput = {
  organizationId: string;
  agentId?: string;
  systemId?: string;
  dataAssetId?: string;
  catalogRevisionId?: string;
  source: FindingSource;
  sourceKey?: string;
  dedupeKey: string;
  ruleCode: string;
  title: string;
  description?: string;
  severity: FindingSeverity;
  status?: FindingStatus;
  evidence?: Prisma.InputJsonValue;
  firstSeenAt?: Date;
  lastSeenAt?: Date;
  correlationId?: string;
};

export class ComplianceFindingService {
  async upsertFinding(input: UpsertComplianceFindingInput) {
    return withTransaction(async (tx) => {
      const now = input.lastSeenAt ?? new Date();
      const finding = await tx.complianceFinding.upsert({
        where: {
          organizationId_dedupeKey: {
            organizationId: input.organizationId,
            dedupeKey: input.dedupeKey,
          },
        },
        create: {
          organizationId: input.organizationId,
          agentId: input.agentId,
          systemId: input.systemId,
          dataAssetId: input.dataAssetId,
          catalogRevisionId: input.catalogRevisionId,
          source: input.source,
          sourceKey: input.sourceKey,
          dedupeKey: input.dedupeKey,
          ruleCode: input.ruleCode,
          title: input.title,
          description: input.description,
          severity: input.severity,
          status: input.status ?? "OPEN",
          evidenceJson: input.evidence,
          firstSeenAt: input.firstSeenAt ?? now,
          lastSeenAt: now,
        },
        update: {
          agentId: input.agentId,
          systemId: input.systemId,
          dataAssetId: input.dataAssetId,
          catalogRevisionId: input.catalogRevisionId,
          source: input.source,
          sourceKey: input.sourceKey,
          ruleCode: input.ruleCode,
          title: input.title,
          description: input.description,
          severity: input.severity,
          status: input.status ?? "OPEN",
          evidenceJson: input.evidence,
          lastSeenAt: now,
          resolvedAt: null,
        },
      });

      await writeOutboxEvent(tx, {
        eventType: DOMAIN_EVENTS.ComplianceFindingUpserted,
        organizationId: input.organizationId,
        correlationId: input.correlationId,
        payload: {
          findingId: finding.id,
          dedupeKey: finding.dedupeKey,
          ruleCode: finding.ruleCode,
          severity: finding.severity,
          status: finding.status,
        },
      });
      return finding;
    });
  }

  async listOpenFindings(organizationId: string) {
    return prisma.complianceFinding.findMany({
      where: {
        organizationId,
        status: { in: ["OPEN", "ACKNOWLEDGED"] },
      },
      orderBy: [{ severity: "desc" }, { lastSeenAt: "desc" }],
    });
  }
}

export const complianceFindingService = new ComplianceFindingService();
