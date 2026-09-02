import { randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { hashToken } from "../../auth/utils/token-crypto.js";
import { appConfig } from "../../../config/app.config.js";
import type { RequestContext } from "../../../shared/types/request-context.js";
import { withTransaction } from "../../../infrastructure/database/transaction-manager.js";
import type { AgentPrismaClient } from "../../agents/types/agent.types.js";
import type { OnboardingIntakeDto } from "../dto/onboarding.dto.js";

const PLUGIN_BY_SYSTEM = {
  postgres: "postgres",
  mongo: "mongo",
  salesforce: "salesforce",
  rest: "rest",
  "code-scanner": "code-scanner",
  "vendor-scanner": "vendor-scanner",
} as const;

export class OnboardingService {
  async intake(ctx: RequestContext, input: OnboardingIntakeDto) {
    const systems = new Set(input.declaredSystems);
    for (const vendor of input.tprmVendors) {
      if (typeof vendor !== "string" && vendor.systemType) {
        const normalized = vendor.systemType.toLowerCase();
        if (normalized in PLUGIN_BY_SYSTEM) {
          systems.add(normalized as keyof typeof PLUGIN_BY_SYSTEM);
        }
      }
    }
    if (input.tprmVendors.length > 0) systems.add("vendor-scanner");
    const requiredPlugins = [...systems].map((system) => PLUGIN_BY_SYSTEM[system]);

    const rawToken = `agent_enroll_${randomBytes(32).toString("base64url")}`;
    const ttlHours = Number(process.env.AGENT_ENROLLMENT_TOKEN_TTL_HOURS ?? 24);
    const expiresAt = new Date(Date.now() + ttlHours * 3_600_000);
    const scopeProfile = {
      agentModeEnabled: true,
      deploymentTier: input.deploymentTier,
      networkScope: input.networkScope,
      tprmVendors: input.tprmVendors,
      declaredPurposes: input.declaredPurposes,
      declaredSystems: [...systems],
      requiredPlugins,
      zoneName: input.zoneName ?? "default",
    };

    const settings = await withTransaction(async (tx) => {
      const db = tx as unknown as AgentPrismaClient;
      const row = await db.organizationControlPlaneSettings.upsert({
        where: { organizationId: ctx.organizationId },
        create: {
          organizationId: ctx.organizationId,
          deploymentTier: input.deploymentTier,
          agentMtlsRequired: process.env.AGENT_MTLS_ENABLED === "true",
          scopeProfileJson: scopeProfile as Prisma.InputJsonValue,
        },
        update: {
          deploymentTier: input.deploymentTier,
          agentMtlsRequired: process.env.AGENT_MTLS_ENABLED === "true",
          scopeProfileJson: scopeProfile as Prisma.InputJsonValue,
        },
      });
      await db.agentEnrollmentToken.create({
        data: {
          organizationId: ctx.organizationId,
          tokenHash: hashToken(rawToken),
          tokenPrefix: rawToken.slice(0, 18),
          scopeProfileJson: scopeProfile as Prisma.InputJsonValue,
          expiresAt,
          createdBy: ctx.actorUserId,
        },
      });
      return row;
    });

    return {
      settings,
      enrollmentToken: rawToken,
      installCommand:
        `dpdpos-agent install --api ${appConfig.apiPublicUrl} ` +
        `--token ${rawToken} --zone ${input.zoneName ?? "default"}`,
      expiresAt,
      requiredPlugins,
    };
  }
}

export const onboardingService = new OnboardingService();
