import ExcelJS from "exceljs";
import { randomUUID } from "node:crypto";
import type { DataAssetLinkType } from "@prisma/client";
import { prisma } from "../../../infrastructure/database/prisma-client.js";
import { NotFoundError, ValidationError } from "../../../shared/errors/app-error.js";
import type { RequestContext } from "../../../shared/types/request-context.js";
import { OpenAICompatibleAdapter } from "../../../infrastructure/ai-provider/openai-compatible.adapter.js";
import { DataAssetRepository } from "../repositories/data-asset.repository.js";
import { toDataAssetResponse } from "../types/data-asset.types.js";

const LINK_TYPES = ["FEEDS", "DERIVES", "COPIES"] as const;

export class InventoryOpsService {
  constructor(private readonly assets = new DataAssetRepository()) {}

  async createLink(
    ctx: RequestContext,
    input: {
      fromAssetId: string;
      toAssetId: string;
      linkType: (typeof LINK_TYPES)[number];
      notes?: string;
    },
  ) {
    if (input.fromAssetId === input.toAssetId) {
      throw new ValidationError("fromAssetId and toAssetId must differ");
    }
    const [from, to] = await Promise.all([
      this.assets.findById(ctx.organizationId, input.fromAssetId),
      this.assets.findById(ctx.organizationId, input.toAssetId),
    ]);
    if (!from || !to) throw new NotFoundError("Data asset not found");

    const row = await prisma.dataAssetLink.create({
      data: {
        id: randomUUID(),
        organizationId: ctx.organizationId,
        fromAssetId: input.fromAssetId,
        toAssetId: input.toAssetId,
        linkType: input.linkType as DataAssetLinkType,
        notes: input.notes,
        createdBy: ctx.actorUserId,
        updatedBy: ctx.actorUserId,
      },
    });
    return {
      id: row.id,
      fromAssetId: row.fromAssetId,
      toAssetId: row.toAssetId,
      linkType: row.linkType,
      notes: row.notes,
    };
  }

  async listLinks(ctx: RequestContext, assetId?: string) {
    const rows = await prisma.dataAssetLink.findMany({
      where: {
        organizationId: ctx.organizationId,
        deletedAt: null,
        ...(assetId
          ? { OR: [{ fromAssetId: assetId }, { toAssetId: assetId }] }
          : {}),
      },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((r) => ({
      id: r.id,
      fromAssetId: r.fromAssetId,
      toAssetId: r.toAssetId,
      linkType: r.linkType,
      notes: r.notes,
    }));
  }

  async deleteLink(ctx: RequestContext, id: string) {
    const existing = await prisma.dataAssetLink.findFirst({
      where: { id, organizationId: ctx.organizationId, deletedAt: null },
    });
    if (!existing) throw new NotFoundError("Asset link not found");
    await prisma.dataAssetLink.update({
      where: { id },
      data: { deletedAt: new Date(), updatedBy: ctx.actorUserId },
    });
    return { id, deleted: true };
  }

  async buildImportTemplate(): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("DataAssets");
    sheet.addRow([
      "assetName",
      "assetType",
      "category",
      "sensitivity",
      "description",
      "storageLocation",
      "retentionPeriod",
      "countries",
    ]);
    sheet.addRow([
      "HR employee records",
      "Database",
      "HR",
      "HIGH",
      "Employee PII",
      "AWS ap-south-1",
      "36 months",
      "IN,SG",
    ]);
    const buf = await workbook.xlsx.writeBuffer();
    return Buffer.from(buf);
  }

  async importFromExcel(ctx: RequestContext, buffer: Buffer) {
    const workbook = new ExcelJS.Workbook();
    // exceljs typings disagree with Buffer generics
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    const sheet = workbook.worksheets[0];
    if (!sheet) throw new ValidationError("Workbook has no sheets");

    const created: string[] = [];
    const errors: Array<{ row: number; message: string }> = [];

    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      void (async () => {
        /* sync loop below */
      })();
    });

    for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
      const row = sheet.getRow(rowNumber);
      const assetName = String(row.getCell(1).text || "").trim();
      if (!assetName) continue;
      try {
        const assetType = String(row.getCell(2).text || "Unknown").trim() || "Unknown";
        const category = String(row.getCell(3).text || "General").trim() || "General";
        const sensitivityRaw = String(row.getCell(4).text || "MEDIUM")
          .trim()
          .toUpperCase();
        const sensitivity = (["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(
          sensitivityRaw,
        )
          ? sensitivityRaw
          : "MEDIUM") as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
        const description = String(row.getCell(5).text || "").trim() || undefined;
        const storageLocation =
          String(row.getCell(6).text || "").trim() || undefined;
        const retentionPeriod =
          String(row.getCell(7).text || "").trim() || undefined;
        const countries = String(row.getCell(8).text || "")
          .split(/[,;\s]+/)
          .map((c) => c.trim().toUpperCase())
          .filter((c) => c.length === 2);

        const asset = await this.assets.create(prisma, ctx, {
          assetName,
          assetType,
          category,
          sensitivity,
          description,
          storageLocation,
          retentionPeriod,
          countries,
        });
        created.push(asset.id);
      } catch (err) {
        errors.push({
          row: rowNumber,
          message: err instanceof Error ? err.message : "Import row failed",
        });
      }
    }

    return { createdCount: created.length, createdIds: created, errors };
  }

  async getDataFlows(ctx: RequestContext) {
    const [assets, activities, vendors, links] = await Promise.all([
      prisma.dataAsset.findMany({
        where: { organizationId: ctx.organizationId, deletedAt: null },
        select: {
          id: true,
          assetName: true,
          category: true,
          sensitivity: true,
          countries: true,
        },
      }),
      prisma.processingActivity.findMany({
        where: { organizationId: ctx.organizationId, deletedAt: null },
        select: {
          id: true,
          purpose: true,
          dataAssetId: true,
          vendorId: true,
          countries: true,
        },
      }),
      prisma.vendor.findMany({
        where: { organizationId: ctx.organizationId, deletedAt: null },
        select: { id: true, name: true, countries: true, status: true },
      }),
      prisma.dataAssetLink.findMany({
        where: { organizationId: ctx.organizationId, deletedAt: null },
        select: {
          id: true,
          fromAssetId: true,
          toAssetId: true,
          linkType: true,
        },
      }),
    ]);

    const nodes = [
      ...assets.map((a) => ({
        id: a.id,
        kind: "asset" as const,
        label: a.assetName,
        meta: {
          category: a.category,
          sensitivity: a.sensitivity,
          countries: a.countries,
        },
      })),
      ...activities.map((a) => ({
        id: a.id,
        kind: "activity" as const,
        label: a.purpose,
        meta: { countries: a.countries },
      })),
      ...vendors.map((v) => ({
        id: v.id,
        kind: "vendor" as const,
        label: v.name,
        meta: { countries: v.countries, status: v.status },
      })),
    ];

    const edges = [
      ...links.map((l) => ({
        id: l.id,
        from: l.fromAssetId,
        to: l.toAssetId,
        kind: l.linkType,
      })),
      ...activities
        .filter((a) => a.dataAssetId)
        .map((a) => ({
          id: `activity-asset:${a.id}`,
          from: a.dataAssetId,
          to: a.id,
          kind: "PROCESSES",
        })),
      ...activities
        .filter((a) => a.vendorId)
        .map((a) => ({
          id: `activity-vendor:${a.id}`,
          from: a.id,
          to: a.vendorId!,
          kind: "TO_VENDOR",
        })),
    ];

    return { nodes, edges };
  }

  async suggestSensitivity(ctx: RequestContext, assetId: string) {
    const asset = await this.assets.findById(ctx.organizationId, assetId);
    if (!asset) throw new NotFoundError("Data asset not found");

    const adapter = new OpenAICompatibleAdapter();
    const { text } = await adapter.complete({
      system:
        "You classify data asset sensitivity for DPDP compliance. Reply with JSON only: {\"sensitivity\":\"LOW|MEDIUM|HIGH|CRITICAL\",\"rationale\":\"...\"}",
      prompt: `Asset name: ${asset.assetName}\nType: ${asset.assetType}\nCategory: ${asset.category}\nDescription: ${asset.description ?? ""}\nCurrent sensitivity: ${asset.sensitivity}`,
      maxTokens: 256,
    });

    let sensitivity = asset.sensitivity;
    let rationale = text;
    try {
      const parsed = JSON.parse(text) as {
        sensitivity?: string;
        rationale?: string;
      };
      if (
        parsed.sensitivity &&
        ["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(parsed.sensitivity)
      ) {
        sensitivity = parsed.sensitivity as typeof sensitivity;
      }
      if (parsed.rationale) rationale = parsed.rationale;
    } catch {
      /* keep raw text */
    }

    return {
      assetId: asset.id,
      current: toDataAssetResponse(asset).sensitivity,
      suggested: sensitivity,
      rationale,
      autoApplied: false,
    };
  }
}

export const inventoryOpsService = new InventoryOpsService();
