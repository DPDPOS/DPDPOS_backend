import { NotFoundError } from "../../../shared/errors/app-error.js";
import { prisma } from "../../../infrastructure/database/prisma-client.js";
import { withTransaction } from "../../../infrastructure/database/transaction-manager.js";
import { writeOutboxEvent } from "../../../events/outbox/outbox.repository.js";
import { DOMAIN_EVENTS } from "../../../events/types/base-event.interface.js";
import { SYSTEM_ROLE_PRESETS } from "../../../shared/constants/permissions.js";
import { getCorrelationId } from "../../../shared/middleware/correlation-id.middleware.js";
import type {
  CreateOrganizationDto,
  UpdateOrganizationDto,
} from "../dto/organization.dto.js";
import { OrganizationRepository } from "../repositories/organization.repository.js";
import {
  toOrganizationResponse,
  type OrganizationCreateResult,
  type OrganizationResponse,
} from "../types/organization.types.js";

export type OrganizationActor = {
  actorUserId?: string;
  correlationId?: string;
};

export class OrganizationService {
  constructor(private readonly repo = new OrganizationRepository()) {}

  async create(
    input: CreateOrganizationDto,
    actor: OrganizationActor = {},
  ): Promise<OrganizationCreateResult> {
    const correlationId = actor.correlationId ?? getCorrelationId();

    return withTransaction(async (tx) => {
      const organization = await this.repo.create(tx, {
        name: input.name,
        industry: input.industry,
        companySize: input.companySize,
        operatingRegion: input.operatingRegion,
        companyType: input.companyType,
        maturityLevel: input.maturityLevel,
        isSignificantDataFiduciary: input.isSignificantDataFiduciary,
        createdBy: actor.actorUserId,
        updatedBy: actor.actorUserId,
      });

      const systemRoles = await this.repo.createSystemRoles(
        tx,
        organization.id,
        Object.entries(SYSTEM_ROLE_PRESETS).map(([name, permissions]) => ({
          name,
          permissions: [...permissions],
        })),
      );

      await writeOutboxEvent(tx, {
        eventType: DOMAIN_EVENTS.OrganizationCreated,
        organizationId: organization.id,
        actorUserId: actor.actorUserId,
        correlationId,
        payload: {
          organizationId: organization.id,
          name: organization.name,
          systemRoles,
        },
      });

      return {
        organization: toOrganizationResponse(organization),
        systemRoles,
      };
    });
  }

  async getById(id: string): Promise<OrganizationResponse> {
    const organization = await this.repo.findById(id);
    if (!organization) {
      throw new NotFoundError("Organization not found");
    }
    return toOrganizationResponse(organization);
  }

  async update(
    id: string,
    input: UpdateOrganizationDto,
    actor: OrganizationActor = {},
  ): Promise<OrganizationResponse> {
    const existing = await this.repo.findById(id);
    if (!existing) {
      throw new NotFoundError("Organization not found");
    }

    // No OrganizationUpdated event in the frozen catalog yet — write only.
    const organization = await this.repo.update(prisma, id, {
      ...input,
      updatedBy: actor.actorUserId,
    });

    return toOrganizationResponse(organization);
  }
}

export const organizationService = new OrganizationService();
