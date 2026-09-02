import { createHash, createHmac } from "node:crypto";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import type { Prisma } from "@prisma/client";
import { env } from "../../../config/env.js";
import { s3Config } from "../../../config/s3.config.js";
import { writeOutboxEvent } from "../../../events/outbox/outbox.repository.js";
import { DOMAIN_EVENTS } from "../../../events/types/base-event.interface.js";
import { prisma } from "../../../infrastructure/database/prisma-client.js";
import { getS3Client } from "../../../infrastructure/storage/s3-adapter.js";
import { NotFoundError } from "../../../shared/errors/app-error.js";
import type { RequestContext } from "../../../shared/types/request-context.js";

export type PublishPluginInput = {
  pluginKey: string;
  version: string;
  name: string;
  description?: string;
  manifest: Record<string, unknown>;
  contentBase64: string;
  enabled?: boolean;
};

export class PluginRegistryService {
  async publishPlugin(ctx: RequestContext, input: PublishPluginInput) {
    const content = Buffer.from(input.contentBase64, "base64");
    const artifactSha256 = createHash("sha256").update(content).digest("hex");
    const signature = createHmac("sha256", env.JWT_ACCESS_SECRET)
      .update(artifactSha256)
      .digest("base64");
    const artifactUri = `${env.PLUGIN_REGISTRY_S3_PREFIX}/${ctx.organizationId}/${input.pluginKey}/${input.version}.wasm`;

    await getS3Client().send(
      new PutObjectCommand({
        Bucket: s3Config.bucket,
        Key: artifactUri,
        Body: content,
        ContentType: "application/wasm",
        Metadata: { sha256: artifactSha256 },
      }),
    );

    return prisma.$transaction(async (tx) => {
      const plugin = await tx.plugin.upsert({
        where: {
          organizationId_pluginKey_version: {
            organizationId: ctx.organizationId,
            pluginKey: input.pluginKey,
            version: input.version,
          },
        },
        create: {
          organizationId: ctx.organizationId,
          pluginKey: input.pluginKey,
          version: input.version,
          name: input.name,
          description: input.description,
          manifestJson: input.manifest as Prisma.InputJsonValue,
          artifactUri,
          artifactSha256,
          signature,
          enabled: input.enabled ?? true,
          createdBy: ctx.actorUserId,
        },
        update: {
          name: input.name,
          description: input.description,
          manifestJson: input.manifest as Prisma.InputJsonValue,
          artifactUri,
          artifactSha256,
          signature,
          enabled: input.enabled ?? true,
          publishedAt: new Date(),
        },
      });
      await writeOutboxEvent(tx, {
        eventType: DOMAIN_EVENTS.PluginPublished,
        organizationId: ctx.organizationId,
        actorUserId: ctx.actorUserId,
        correlationId: ctx.correlationId,
        payload: { pluginId: plugin.id, pluginKey: plugin.pluginKey, version: plugin.version },
      });
      return plugin;
    });
  }

  async listPlugins(organizationId: string) {
    return prisma.plugin.findMany({
      where: { OR: [{ organizationId }, { organizationId: null }] },
      orderBy: [{ pluginKey: "asc" }, { publishedAt: "desc" }],
    });
  }

  async getManifestForOrg(organizationId: string) {
    const settings = await prisma.organizationControlPlaneSettings.findUnique({
      where: { organizationId },
    });
    const profile =
      settings?.scopeProfileJson && typeof settings.scopeProfileJson === "object"
        ? (settings.scopeProfileJson as Record<string, unknown>)
        : {};
    const configured = profile.requiredPluginsJson ?? profile.requiredPlugins;
    const required = Array.isArray(configured)
      ? configured.filter((value): value is string => typeof value === "string")
      : [];
    const plugins = required.length
      ? await prisma.plugin.findMany({
          where: {
            pluginKey: { in: required },
            enabled: true,
            OR: [{ organizationId }, { organizationId: null }],
          },
          orderBy: [{ pluginKey: "asc" }, { publishedAt: "desc" }],
        })
      : [];

    const latest = new Map<string, (typeof plugins)[number]>();
    for (const plugin of plugins) {
      if (!latest.has(plugin.pluginKey)) latest.set(plugin.pluginKey, plugin);
    }
    return {
      generatedAt: new Date().toISOString(),
      plugins: [...latest.values()].map((plugin) => ({
        id: plugin.id,
        pluginKey: plugin.pluginKey,
        version: plugin.version,
        name: plugin.name,
        manifest: plugin.manifestJson,
        sha256: plugin.artifactSha256,
        signature: plugin.signature,
        downloadUrl: `/api/v1/plugins/${plugin.id}.wasm`,
      })),
    };
  }

  async getPluginBytes(organizationId: string, pluginId: string) {
    const plugin = await prisma.plugin.findFirst({
      where: {
        id: pluginId,
        enabled: true,
        OR: [{ organizationId }, { organizationId: null }],
      },
    });
    if (!plugin) throw new NotFoundError("Plugin not found");
    const response = await getS3Client().send(
      new GetObjectCommand({ Bucket: s3Config.bucket, Key: plugin.artifactUri }),
    );
    if (!response.Body) throw new NotFoundError("Plugin artifact not found");
    return {
      plugin,
      bytes: Buffer.from(await response.Body.transformToByteArray()),
    };
  }
}

export const pluginRegistryService = new PluginRegistryService();
