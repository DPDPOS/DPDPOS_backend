import { Prisma } from "@prisma/client";

import { ConflictError, NotFoundError, ValidationError } from "../../../shared/errors/app-error.js";
import { withTransaction } from "../../../infrastructure/database/transaction-manager.js";

import type { RequestContext } from "../../../shared/types/request-context.js";

import { NoticeRepository } from "../repositories/notice.repository.js";
import type { CreateNoticeDto } from "../dto/notice.dto.js";

import {
  toNoticeResponse,
  type NoticeResponse,
} from "../types/notice.types.js";

export type NoticeDiffResponse = {
  noticeId: string;
  title: string;
  fromVersion: number;
  toVersion: number;
  unifiedDiff: string;
  fromContent: string;
  toContent: string;
};

/** Minimal unified diff for notice content comparison. */
export function buildUnifiedDiff(
  fromLabel: string,
  toLabel: string,
  fromText: string,
  toText: string,
): string {
  const a = fromText.replace(/\r\n/g, "\n").split("\n");
  const b = toText.replace(/\r\n/g, "\n").split("\n");
  const lines: string[] = [`--- ${fromLabel}`, `+++ ${toLabel}`];
  const max = Math.max(a.length, b.length);
  let hunk: string[] = [];
  let hunkStart = 0;
  const flush = () => {
    if (hunk.length === 0) return;
    lines.push(`@@ -${hunkStart + 1} +${hunkStart + 1} @@`);
    lines.push(...hunk);
    hunk = [];
  };
  for (let i = 0; i < max; i++) {
    const left = a[i];
    const right = b[i];
    if (left === right) {
      flush();
      continue;
    }
    if (hunk.length === 0) hunkStart = i;
    if (left !== undefined && right === undefined) {
      hunk.push(`-${left}`);
    } else if (left === undefined && right !== undefined) {
      hunk.push(`+${right}`);
    } else {
      hunk.push(`-${left}`);
      hunk.push(`+${right}`);
    }
  }
  flush();
  if (lines.length === 2) {
    lines.push("@@ unchanged @@");
  }
  return lines.join("\n");
}

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
          contentFormat: input.contentFormat ?? "PLAIN",
          version,
          effectiveFrom: input.effectiveFrom
            ? new Date(input.effectiveFrom)
            : undefined,
        });
      } catch (err) {
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

  async diff(
    ctx: RequestContext,
    id: string,
    againstVersion: number,
  ): Promise<NoticeDiffResponse> {
    const current = await this.repository.findById(ctx.organizationId, id);
    if (!current) {
      throw new NotFoundError("Notice not found");
    }
    if (againstVersion === current.version) {
      throw new ValidationError("againstVersion must differ from the notice version");
    }
    const other = await this.repository.findByTitleAndVersion(
      ctx.organizationId,
      current.title,
      againstVersion,
    );
    if (!other) {
      throw new NotFoundError(
        `Notice version ${againstVersion} not found for title "${current.title}"`,
      );
    }

    const from = againstVersion < current.version ? other : current;
    const to = againstVersion < current.version ? current : other;

    return {
      noticeId: current.id,
      title: current.title,
      fromVersion: from.version,
      toVersion: to.version,
      fromContent: from.content,
      toContent: to.content,
      unifiedDiff: buildUnifiedDiff(
        `v${from.version}`,
        `v${to.version}`,
        from.content,
        to.content,
      ),
    };
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
