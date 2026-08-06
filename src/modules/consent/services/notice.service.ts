import { Prisma } from "@prisma/client";

import { ConflictError, NotFoundError } from "../../../shared/errors/app-error.js";
import { withTransaction } from "../../../infrastructure/database/transaction-manager.js";

import type { RequestContext } from "../../../shared/types/request-context.js";

import { NoticeRepository } from "../repositories/notice.repository.js";
import type { CreateNoticeDto } from "../dto/notice.dto.js";

import {
  toNoticeResponse,
  type NoticeResponse,
} from "../types/notice.types.js";

export class NoticeService {
  constructor(
    private readonly repository = new NoticeRepository(),
  ) {}

  /**
   * Notices are versioned by title: publishing a notice whose title already
   * exists creates the next version, keeping a full consent-history trail.
   */
  async create(
    ctx: RequestContext,
    input: CreateNoticeDto,
  ): Promise<NoticeResponse> {
    // Version is derived from the latest published version of the same title.
    const latest = await this.repository.findLatestByTitle(
      ctx.organizationId,
      input.title,
    );

    const version = (latest?.version ?? 0) + 1;

    return withTransaction(async (tx) => {
      let notice;
      try {
        notice = await this.repository.create(tx, ctx, {
          title: input.title,
          content: input.content,
          version,
          effectiveFrom: input.effectiveFrom
            ? new Date(input.effectiveFrom)
            : undefined,
        });
      } catch (err) {
        // A concurrent publish of the same title can race onto the same
        // version number; surface it as a clean conflict instead of a 500.
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === "P2002"
        ) {
          throw new ConflictError(
            "A concurrent publish produced this notice version; please retry",
          );
        }
        throw err;
      }

      return toNoticeResponse(notice);
    });
  }

  async getById(
    ctx: RequestContext,
    id: string,
  ): Promise<NoticeResponse> {
    const notice = await this.repository.findById(
      ctx.organizationId,
      id,
    );

    if (!notice) {
      throw new NotFoundError("Notice not found");
    }

    return toNoticeResponse(notice);
  }

  async list(
    ctx: RequestContext,
  ): Promise<NoticeResponse[]> {
    const notices = await this.repository.list(
      ctx.organizationId,
    );

    return notices.map(toNoticeResponse);
  }

  async softDelete(
    ctx: RequestContext,
    id: string,
  ): Promise<NoticeResponse> {
    const existing = await this.repository.findById(
      ctx.organizationId,
      id,
    );

    if (!existing) {
      throw new NotFoundError("Notice not found");
    }

    return withTransaction(async (tx) => {
      const notice = await this.repository.softDelete(
        tx,
        ctx,
        id,
      );

      return toNoticeResponse(notice);
    });
  }
}

export const noticeService = new NoticeService();
