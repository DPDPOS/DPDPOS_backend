import { createHash } from "node:crypto";
import type { FindingSeverity, Prisma } from "@prisma/client";

import { writeOutboxEvent } from "../events/outbox/outbox.repository.js";
import { DOMAIN_EVENTS } from "../events/types/base-event.interface.js";
import { prisma } from "../infrastructure/database/prisma-client.js";
import { withTransaction } from "../infrastructure/database/transaction-manager.js";
import { ConflictError, ForbiddenError } from "../shared/errors/app-error.js";
import { SYSTEM_ACTOR_ID } from "../shared/constants/system-actor.js";
import type { AgentContext } from "../modules/agents/types/agent.types.js";
import { violationService } from "../modules/violations/services/violation.service.js";
import {
  complianceFindingService,
  type UpsertComplianceFindingInput,
} from "./compliance-finding.service.js";
import { tenantContextResolver } from "./tenant-context.resolver.js";

export type DiscoveryField = {
  externalId: string;
  name: string;
  path?: string;
  dataType?: string;
  nullable?: boolean;
  pii: boolean;
  piiCategory?: string;
  confidence?: number;
  tags?: string[];
  isIdentifier?: boolean;
  identityHashes?: string[];
  metadata?: Record<string, unknown>;
};

export type DiscoveryAsset = {
  externalId: string;
  name: string;
  assetType: string;
  path?: string;
  recordCountEstimate?: number;
  metadata?: Record<string, unknown>;
  fields: DiscoveryField[];
};

export type DiscoverySystem = {
  externalId?: string;
  externalSystemKey?: string;
  name: string;
  systemType: string;
  connectorKey?: string;
  environment?: string;
  location?: string;
  metadata?: Record<string, unknown>;
  assets: DiscoveryAsset[];
};

export type DiscoveryReport = {
  schemaVersion: string;
  reportId: string;
  agentId: string;
  revision: number;
  discoveredAt: string;
  reportHash: string;
  systems: DiscoverySystem[];
  piiMap?: unknown;
  findings?: unknown[];
};

type PersistedSystem = {
  id: string;
  externalId: string;
  name: string;
  assetIds: Map<string, string>;
};

function json(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function externalSystemId(system: DiscoverySystem): string {
  return (
    system.externalSystemKey ??
    system.externalId ??
    `${system.systemType}:${system.name.trim().toLowerCase()}`
  );
}

function fieldLocator(systemExternalId: string, assetExternalId: string, fieldExternalId: string) {
  return `${systemExternalId}|${assetExternalId}|${fieldExternalId}`;
}

function sensitivityFor(fields: DiscoveryField[]) {
  const confidence = Math.max(
    0,
    ...fields.filter((field) => field.pii).map((field) => field.confidence ?? 0.5),
  );
  if (confidence >= 0.9) return "CRITICAL" as const;
  if (confidence >= 0.7) return "HIGH" as const;
  if (confidence > 0) return "MEDIUM" as const;
  return "LOW" as const;
}

export class CatalogIngestionService {
  async ingestDiscoveryReport(agentCtx: AgentContext, report: DiscoveryReport) {
    if (!(await tenantContextResolver.isAgentModeEnabled(agentCtx.organizationId))) {
      throw new ForbiddenError("Agent discovery is disabled for this organization");
    }
    if (report.agentId !== agentCtx.agentId) {
      throw new ForbiddenError("Discovery report agentId does not match the authenticated agent");
    }

    const duplicate = await prisma.catalogRevision.findUnique({
      where: {
        agentId_reportHash: {
          agentId: agentCtx.agentId,
          reportHash: report.reportHash,
        },
      },
    });
    if (duplicate) {
      return { accepted: true, duplicate: true, catalogRevisionId: duplicate.id };
    }

    const previous = await prisma.catalogRevision.findFirst({
      where: { organizationId: agentCtx.organizationId, agentId: agentCtx.agentId },
      orderBy: { revision: "desc" },
    });
    if (previous && report.revision <= previous.revision) {
      throw new ConflictError(
        `Discovery revision must be greater than ${previous.revision}`,
      );
    }

    const previousReport = previous?.reportJson as unknown as
      | { systems?: DiscoverySystem[] }
      | undefined;
    const previousIds = new Set(
      (previousReport?.systems ?? []).map(externalSystemId),
    );
    const currentIds = new Set(report.systems.map(externalSystemId));
    const removedIds = [...previousIds].filter((id) => !currentIds.has(id));
    const addedIds = [...currentIds].filter((id) => !previousIds.has(id));

    const { revision, systems } = await withTransaction(async (tx) => {
      const catalogRevision = await tx.catalogRevision.create({
        data: {
          organizationId: agentCtx.organizationId,
          agentId: agentCtx.agentId,
          revision: report.revision,
          schemaVersion: report.schemaVersion,
          reportHash: report.reportHash,
          reportJson: json(report),
          summaryJson: json({
            systems: report.systems.length,
            addedSystems: addedIds,
            removedSystems: removedIds,
            previousRevision: previous?.revision ?? null,
          }),
          discoveredAt: new Date(report.discoveredAt),
        },
      });

      const persistedSystems: PersistedSystem[] = [];
      for (const systemInput of report.systems) {
        const externalId = externalSystemId(systemInput);
        const existingSystem = await tx.dataSystem.findFirst({
          where: {
            organizationId: agentCtx.organizationId,
            OR: [
              { externalId },
              {
                name: { equals: systemInput.name, mode: "insensitive" },
                systemType: systemInput.systemType,
              },
            ],
          },
        });
        const systemData = {
          agentId: agentCtx.agentId,
          externalId,
          name: systemInput.name,
          systemType: systemInput.systemType,
          connectorKey: systemInput.connectorKey,
          environment: systemInput.environment,
          location: systemInput.location,
          metadataJson: systemInput.metadata ? json(systemInput.metadata) : undefined,
          lastDiscoveredAt: new Date(report.discoveredAt),
          deletedAt: null,
        };
        const system = existingSystem
          ? await tx.dataSystem.update({
              where: { id: existingSystem.id },
              data: systemData,
            })
          : await tx.dataSystem.create({
              data: {
                organizationId: agentCtx.organizationId,
                ...systemData,
              },
            });
        const assetIds = new Map<string, string>();

        for (const assetInput of systemInput.assets) {
          const existingAsset = await tx.dataAsset.findFirst({
            where: {
              organizationId: agentCtx.organizationId,
              systemId: system.id,
              assetName: assetInput.name,
              assetType: assetInput.assetType,
            },
          });
          const piiTags = [
            ...new Set(
              assetInput.fields
                .filter((field) => field.pii)
                .flatMap((field) => [
                  ...(field.piiCategory ? [field.piiCategory] : []),
                  ...(field.tags ?? []),
                ]),
            ),
          ];
          const assetData = {
            assetName: assetInput.name,
            assetType: assetInput.assetType,
            category: piiTags[0] ?? "DISCOVERED",
            sensitivity: sensitivityFor(assetInput.fields),
            description:
              typeof assetInput.metadata?.description === "string"
                ? assetInput.metadata.description
                : undefined,
            storageLocation: assetInput.path ?? systemInput.location,
            source: "AGENT" as const,
            systemId: system.id,
            agentId: agentCtx.agentId,
            fieldSchemaJson: json(assetInput.fields),
            piiTagsJson: json(piiTags),
            lastDiscoveredAt: new Date(report.discoveredAt),
            status: "ACTIVE" as const,
            deletedAt: null,
          };
          const asset = existingAsset
            ? await tx.dataAsset.update({
                where: { id: existingAsset.id },
                data: assetData,
              })
            : await tx.dataAsset.create({
                data: {
                  organizationId: agentCtx.organizationId,
                  ...assetData,
                },
              });
          assetIds.set(assetInput.externalId, asset.id);

          for (const fieldInput of assetInput.fields) {
            await tx.dataField.upsert({
              where: {
                systemId_externalId: {
                  systemId: system.id,
                  externalId: fieldInput.externalId,
                },
              },
              create: {
                organizationId: agentCtx.organizationId,
                systemId: system.id,
                dataAssetId: asset.id,
                externalId: fieldInput.externalId,
                name: fieldInput.name,
                path: fieldInput.path,
                dataType: fieldInput.dataType,
                nullable: fieldInput.nullable,
                pii: fieldInput.pii,
                piiCategory: fieldInput.piiCategory,
                confidence: fieldInput.confidence,
                tagsJson: json(fieldInput.tags ?? []),
                metadataJson: fieldInput.metadata ? json(fieldInput.metadata) : undefined,
                lastDiscoveredAt: new Date(report.discoveredAt),
              },
              update: {
                dataAssetId: asset.id,
                name: fieldInput.name,
                path: fieldInput.path,
                dataType: fieldInput.dataType,
                nullable: fieldInput.nullable,
                pii: fieldInput.pii,
                piiCategory: fieldInput.piiCategory,
                confidence: fieldInput.confidence,
                tagsJson: json(fieldInput.tags ?? []),
                metadataJson: fieldInput.metadata ? json(fieldInput.metadata) : undefined,
                lastDiscoveredAt: new Date(report.discoveredAt),
              },
            });

            const isIdentifier =
              fieldInput.isIdentifier === true ||
              fieldInput.tags?.some((tag) => tag.toLowerCase() === "identifier");
            if (isIdentifier) {
              const locator = fieldLocator(
                externalId,
                assetInput.externalId,
                fieldInput.externalId,
              );
              const targetIdentityHash = hash(`field:${locator}`);
              const sourceHashes =
                fieldInput.identityHashes?.length
                  ? fieldInput.identityHashes
                  : [targetIdentityHash];
              for (const sourceIdentityHash of sourceHashes) {
                await tx.identityGraphEdge.upsert({
                  where: {
                    organizationId_systemId_sourceIdentityHash_targetIdentityHash_edgeType: {
                      organizationId: agentCtx.organizationId,
                      systemId: system.id,
                      sourceIdentityHash,
                      targetIdentityHash,
                      edgeType: "FIELD_IDENTIFIER",
                    },
                  },
                  create: {
                    organizationId: agentCtx.organizationId,
                    systemId: system.id,
                    sourceIdentityHash,
                    targetIdentityHash,
                    edgeType: "FIELD_IDENTIFIER",
                    confidence: fieldInput.confidence,
                    evidenceJson: json({ locator }),
                    lastSeenAt: new Date(report.discoveredAt),
                  },
                  update: {
                    confidence: fieldInput.confidence,
                    evidenceJson: json({ locator }),
                    lastSeenAt: new Date(report.discoveredAt),
                  },
                });
              }
            }
          }
        }
        persistedSystems.push({
          id: system.id,
          externalId,
          name: system.name,
          assetIds,
        });
      }

      await writeOutboxEvent(tx, {
        eventType: DOMAIN_EVENTS.CatalogRevisionCreated,
        organizationId: agentCtx.organizationId,
        correlationId: agentCtx.correlationId,
        payload: {
          catalogRevisionId: catalogRevision.id,
          agentId: agentCtx.agentId,
          revision: catalogRevision.revision,
          addedSystems: addedIds.length,
          removedSystems: removedIds.length,
        },
      });
      return { revision: catalogRevision, systems: persistedSystems };
    });

    const vendors = await prisma.vendor.findMany({
      where: { organizationId: agentCtx.organizationId, deletedAt: null },
      select: { name: true, legalName: true },
    });
    const vendorNames = new Set(
      vendors.flatMap((vendor) => [vendor.name, vendor.legalName ?? ""])
        .map((name) => name.trim().toLowerCase())
        .filter(Boolean),
    );
    const findingInputs: UpsertComplianceFindingInput[] = [];

    for (const system of systems) {
      const inputSystem = report.systems.find(
        (candidate) => externalSystemId(candidate) === system.externalId,
      )!;
      if (!vendorNames.has(system.name.trim().toLowerCase())) {
        findingInputs.push({
          organizationId: agentCtx.organizationId,
          agentId: agentCtx.agentId,
          systemId: system.id,
          catalogRevisionId: revision.id,
          source: "AGENT",
          sourceKey: system.externalId,
          dedupeKey: `VLD-UNMAPPED-SYSTEM|DataSystem|${system.id}`,
          ruleCode: "VLD-UNMAPPED-SYSTEM",
          title: `Discovered system is not mapped to a vendor: ${system.name}`,
          description: "No active inventory vendor matches the discovered system name.",
          severity: "HIGH",
          evidence: json({ externalSystemId: system.externalId }),
          correlationId: agentCtx.correlationId,
        });
      }

      for (const asset of inputSystem.assets) {
        const highConfidencePii = asset.fields.some(
          (field) => field.pii && (field.confidence ?? 0) >= 0.8,
        );
        if (!highConfidencePii) continue;
        const dataAssetId = system.assetIds.get(asset.externalId)!;
        const legalBasis = await prisma.processingActivity.findFirst({
          where: {
            organizationId: agentCtx.organizationId,
            dataAssetId,
            deletedAt: null,
            legalBasis: { not: null },
          },
          select: { id: true },
        });
        if (!legalBasis) {
          findingInputs.push({
            organizationId: agentCtx.organizationId,
            agentId: agentCtx.agentId,
            systemId: system.id,
            dataAssetId,
            catalogRevisionId: revision.id,
            source: "AGENT",
            sourceKey: asset.externalId,
            dedupeKey: `VLD-PII-NO-BASIS|DataAsset|${dataAssetId}`,
            ruleCode: "VLD-PII-NO-BASIS",
            title: `High-confidence PII has no documented legal basis: ${asset.name}`,
            severity: "CRITICAL",
            evidence: json({
              systemExternalId: system.externalId,
              assetExternalId: asset.externalId,
            }),
            correlationId: agentCtx.correlationId,
          });
        }
      }
    }

    for (const removedId of removedIds) {
      const missingSystem = await prisma.dataSystem.findFirst({
        where: {
          organizationId: agentCtx.organizationId,
          agentId: agentCtx.agentId,
          externalId: removedId,
        },
      });
      findingInputs.push({
        organizationId: agentCtx.organizationId,
        agentId: agentCtx.agentId,
        systemId: missingSystem?.id,
        catalogRevisionId: revision.id,
        source: "AGENT",
        sourceKey: removedId,
        dedupeKey: `VLD-CATALOG-DRIFT|DataSystem|${missingSystem?.id ?? removedId}`,
        ruleCode: "VLD-CATALOG-DRIFT",
        title: `Previously discovered system is missing: ${missingSystem?.name ?? removedId}`,
        severity: "HIGH",
        evidence: json({ previousRevision: previous?.revision, externalSystemId: removedId }),
        correlationId: agentCtx.correlationId,
      });
    }

    const findings = [];
    for (const input of findingInputs) {
      const finding = await complianceFindingService.upsertFinding(input);
      findings.push(finding);
      if (finding.severity === "CRITICAL") {
        await violationService.openOrDedupe(
          {
            organizationId: agentCtx.organizationId,
            actorUserId: SYSTEM_ACTOR_ID,
            correlationId: agentCtx.correlationId,
            permissions: [],
            roles: [],
          },
          {
            findingSource: "AGENT",
            ruleOrControlCode: finding.ruleCode,
            entityType: finding.dataAssetId ? "DataAsset" : "DataSystem",
            entityId: finding.dataAssetId ?? finding.systemId ?? finding.id,
            severity: finding.severity,
            title: finding.title,
            description: finding.description ?? undefined,
            agentId: agentCtx.agentId,
            complianceFindingId: finding.id,
            correlationId: agentCtx.correlationId,
          },
        );
      }
    }

    return {
      accepted: true,
      duplicate: false,
      catalogRevisionId: revision.id,
      systems: systems.length,
      findings: findings.length,
    };
  }
}

export const catalogIngestionService = new CatalogIngestionService();
