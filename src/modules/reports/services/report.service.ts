import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { logger } from "../../../infrastructure/logging/logger.js";
import { withTransaction } from "../../../infrastructure/database/transaction-manager.js";
import type { RequestContext } from "../../../shared/types/request-context.js";
import { NotFoundError, ConflictError } from "../../../shared/errors/app-error.js";
import { ReportRepository } from "../repositories/report.repository.js";
import type { GenerateReportDto, ListReportsQuery } from "../dto/report.dto.js";
import { reportQueue } from "../../../jobs/queues/report.queue.js";
import { getS3Client } from "../../../infrastructure/storage/s3-adapter.js";
import { s3Config } from "../../../config/s3.config.js";

export class ReportService {
  private repo = new ReportRepository();

  async generate(ctx: RequestContext, dto: GenerateReportDto) {
    return withTransaction(async (tx) => {
      const reportTitle = dto.title || dto.reportType;
      
      const row = await this.repo.create(tx, ctx, {
        reportType: dto.reportType,
        title: reportTitle,
        format: dto.format,
        parameters: dto.parameters || {},
        status: "PENDING",
        generatedBy: ctx.actorUserId,
      });

      await reportQueue.add("generate-report", { reportId: row.id }, {
        jobId: `report-${row.id}`
      });

      return row;
    });
  }

  async list(ctx: RequestContext, query: ListReportsQuery) {
    const filters = {
      reportType: query.reportType,
      status: query.status,
    };
    
    const [data, total] = await Promise.all([
      this.repo.list(ctx.organizationId, filters, query.page, query.pageSize),
      this.repo.countByOrg(ctx.organizationId, filters),
    ]);
    
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    return {
      items: data,
      meta: {
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.max(1, Math.ceil(total / pageSize)),
        },
      },
    };
  }

  async getById(ctx: RequestContext, id: string) {
    const row = await this.repo.findById(ctx.organizationId, id);
    if (!row) {
      throw new NotFoundError("Report not found");
    }
    return row;
  }

  async getDownloadUrl(ctx: RequestContext, id: string) {
    const row = await this.repo.findById(ctx.organizationId, id);
    if (!row) {
      throw new NotFoundError("Report not found");
    }
    
    if (row.status !== "COMPLETED" || !row.storageKey) {
      throw new ConflictError("Report is not completed or has no file");
    }

    const s3Client = getS3Client();
    const command = new GetObjectCommand({
      Bucket: s3Config.bucket,
      Key: row.storageKey,
    });

    const url = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
    
    return { url };
  }

  async cancel(ctx: RequestContext, id: string) {
    const report = await this.repo.findById(ctx.organizationId, id);
    if (!report) throw new NotFoundError("Report not found");
    if (report.status !== "PENDING" && report.status !== "GENERATING") {
      throw new ConflictError("Only pending or generating reports can be cancelled");
    }
    await reportQueue.remove(`report-${id}`);
    if (!await this.repo.cancel(ctx.organizationId, id)) {
      throw new ConflictError("Report could not be cancelled");
    }
    return { cancelled: true };
  }
}

export const reportService = new ReportService();
