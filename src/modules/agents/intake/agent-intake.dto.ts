import { z } from "zod";

export const agentIntakeSchema = z.object({
  deploymentTier: z.enum(["COMMUNITY", "ENTERPRISE", "MANAGED"]),
  networkScope: z.object({
    vpcCidrs: z.array(z.string().trim().min(1)).max(100).default([]),
    k8sNamespaces: z.array(z.string().trim().min(1)).max(500).default([]),
  }),
  tprmVendors: z
    .array(
      z.union([
        z.string().trim().min(1),
        z.object({
          name: z.string().trim().min(1),
          systemType: z.string().trim().min(1).optional(),
        }),
      ]),
    )
    .max(1_000)
    .default([]),
  declaredPurposes: z.array(z.string().trim().min(1)).max(1_000).default([]),
  declaredSystems: z
    .array(
      z.enum([
        "postgres",
        "mongo",
        "salesforce",
        "rest",
        "code-scanner",
        "vendor-scanner",
      ]),
    )
    .max(100)
    .default([]),
  zoneName: z.string().trim().min(1).max(120).optional(),
});

export type AgentIntakeDto = z.infer<typeof agentIntakeSchema>;
