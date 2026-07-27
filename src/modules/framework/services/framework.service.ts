import type { Prisma } from "@prisma/client";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../../../shared/errors/app-error.js";
import { withTransaction } from "../../../infrastructure/database/transaction-manager.js";
import { writeOutboxEvent } from "../../../events/outbox/outbox.repository.js";
import { DOMAIN_EVENTS } from "../../../events/types/base-event.interface.js";
import type { RequestContext } from "../../../shared/types/request-context.js";
import type {
  GenerateFrameworkDto,
  PublishFrameworkDto,
} from "../dto/framework.dto.js";
import { FrameworkRepository } from "../repositories/framework.repository.js";
import {
  buildRoadmapJson,
  selectTemplatesForProfile,
  type FrameworkProfile,
} from "../domain/templates.js";
import {
  toFrameworkResponse,
  type FrameworkResponse,
} from "../types/framework.types.js";

export class FrameworkService {
  constructor(private readonly repo = new FrameworkRepository()) {}

  async generate(
    ctx: RequestContext,
    input: GenerateFrameworkDto,
  ): Promise<FrameworkResponse> {
    const profile: FrameworkProfile = {
      industryProfile: input.industryProfile.trim().toLowerCase(),
      maturityLevel: input.maturityLevel,
      dataSensitivity: input.dataSensitivity,
      departmentCount: input.departmentCount,
      processorCount: input.processorCount,
      isSdf: input.isSdf,
    };

    const selected = selectTemplatesForProfile(profile);
    if (selected.controls.length === 0) {
      throw new ValidationError(
        "No controls matched the provided organization profile",
      );
    }

    const generatedAt = new Date();
    const name =
      input.name?.trim() ||
      `DPDP Framework — ${profile.industryProfile} (${profile.maturityLevel})`;

    const frameworkId = await withTransaction(async (tx) => {
      await this.repo.deleteDraftsWithChildren(tx, ctx.organizationId);

      // Placeholder roadmap; updated after child rows have due dates
      const framework = await this.repo.createFramework(tx, {
        organizationId: ctx.organizationId,
        name,
        industryProfile: profile.industryProfile,
        maturityLevel: profile.maturityLevel,
        isSdf: profile.isSdf,
        roadmapJson: {},
        createdBy: ctx.actorUserId,
        updatedBy: ctx.actorUserId,
      });

      const controlByTemplateCode = new Map<string, string>();
      const roadmapControls: Array<{
        code: string;
        title: string;
        phase: (typeof selected.controls)[number]["phase"];
        dueAt: string;
      }> = [];

      for (const tpl of selected.controls) {
        const dueAt = new Date(
          generatedAt.getTime() + tpl.dueDaysFromGenerate * 24 * 60 * 60 * 1000,
        );
        const control = await this.repo.createControl(tx, {
          organizationId: ctx.organizationId,
          frameworkId: framework.id,
          code: tpl.code,
          title: tpl.title,
          description: tpl.description,
          legalBasisRef: tpl.legalBasisRef,
          dueAt,
          createdBy: ctx.actorUserId,
          updatedBy: ctx.actorUserId,
        });
        controlByTemplateCode.set(tpl.code, control.id);
        roadmapControls.push({
          code: tpl.code,
          title: tpl.title,
          phase: tpl.phase,
          dueAt: dueAt.toISOString(),
        });
      }

      const createdRequirementCodes = new Set<string>();

      for (const tpl of selected.controls) {
        const controlId = controlByTemplateCode.get(tpl.code);
        if (!controlId) continue;
        for (const reqCode of tpl.requirementCodes) {
          if (createdRequirementCodes.has(reqCode)) continue;
          const reqTpl = selected.requirements.find((r) => r.code === reqCode);
          if (!reqTpl) continue;
          await this.repo.createRequirement(tx, {
            organizationId: ctx.organizationId,
            frameworkId: framework.id,
            controlId,
            code: reqTpl.code,
            title: reqTpl.title,
            description: reqTpl.description,
            legalBasisRef: reqTpl.legalBasisRef,
            createdBy: ctx.actorUserId,
            updatedBy: ctx.actorUserId,
          });
          createdRequirementCodes.add(reqCode);
        }
      }

      const roadmapJson = buildRoadmapJson({
        profile,
        controls: roadmapControls,
        requirementCount: createdRequirementCodes.size,
        generatedAt: generatedAt.toISOString(),
      });

      await this.repo.updateRoadmapJson(tx, {
        frameworkId: framework.id,
        roadmapJson: roadmapJson as Prisma.InputJsonValue,
        updatedBy: ctx.actorUserId,
      });

      if (input.publish) {
        await this.publishInTx(tx, ctx, framework.id, framework.name);
      }

      return framework.id;
    });

    const loaded = await this.repo.findById({
      organizationId: ctx.organizationId,
      id: frameworkId,
    });
    if (!loaded) {
      throw new NotFoundError("Framework not found after generation");
    }
    return toFrameworkResponse(loaded);
  }

  async getRoadmap(
    ctx: RequestContext,
    frameworkId?: string,
  ): Promise<FrameworkResponse> {
    const row = frameworkId
      ? await this.repo.findById({
          organizationId: ctx.organizationId,
          id: frameworkId,
        })
      : await this.repo.findLatestForOrg({
          organizationId: ctx.organizationId,
        });

    if (!row) {
      throw new NotFoundError("Framework roadmap not found");
    }
    return toFrameworkResponse(row);
  }

  async publish(
    ctx: RequestContext,
    input: PublishFrameworkDto = {},
  ): Promise<FrameworkResponse> {
    const target =
      input.frameworkId != null
        ? await this.repo.findById({
            organizationId: ctx.organizationId,
            id: input.frameworkId,
          })
        : await this.repo.findLatestForOrg({
            organizationId: ctx.organizationId,
          });

    if (!target) {
      throw new NotFoundError("Framework not found");
    }
    if (target.status === "PUBLISHED") {
      throw new ConflictError("Framework is already published");
    }
    if (target.status === "ARCHIVED") {
      throw new ConflictError("Cannot publish an archived framework");
    }

    await withTransaction(async (tx) => {
      await this.publishInTx(tx, ctx, target.id, target.name);
    });

    const loaded = await this.repo.findById({
      organizationId: ctx.organizationId,
      id: target.id,
    });
    if (!loaded) {
      throw new NotFoundError("Framework not found after publish");
    }
    return toFrameworkResponse(loaded);
  }

  private async publishInTx(
    tx: Prisma.TransactionClient,
    ctx: RequestContext,
    frameworkId: string,
    name: string,
  ): Promise<void> {
    const publishedAt = new Date();
    await this.repo.publish(tx, {
      organizationId: ctx.organizationId,
      frameworkId,
      updatedBy: ctx.actorUserId,
      publishedAt,
    });

    await writeOutboxEvent(tx, {
      eventType: DOMAIN_EVENTS.FrameworkPublished,
      organizationId: ctx.organizationId,
      actorUserId: ctx.actorUserId,
      correlationId: ctx.correlationId,
      payload: {
        frameworkId,
        name,
      },
    });
  }
}

export const frameworkService = new FrameworkService();
