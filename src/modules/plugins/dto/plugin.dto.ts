import { z } from "zod";

export const publishPluginSchema = z.object({
  pluginKey: z.string().min(1).max(100).regex(/^[a-z0-9._-]+$/i),
  version: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  description: z.string().max(2_000).optional(),
  manifest: z.record(z.string(), z.unknown()),
  contentBase64: z.string().min(1),
  enabled: z.boolean().optional(),
});

export const pluginArtifactParamsSchema = z.object({
  id: z.string().uuid(),
});
