import type { Request } from "express";
import { prisma } from "../../../infrastructure/database/prisma-client.js";

export type AgentContext = {
  agentId: string;
  organizationId: string;
  zoneName: string;
  correlationId: string;
};

export type AgentAuthenticatedRequest = Request & {
  correlationId?: string;
  agentContext?: AgentContext;
};

/**
 * Temporary compatibility boundary while the agent Prisma models are landing
 * in parallel. Remove this cast after `prisma generate` exposes the delegates.
 */
export type AgentPrismaClient = typeof prisma & {
  agent: any;
  agentEnrollmentToken: any;
  agentCertificate: any;
  agentTask: any;
  organizationControlPlaneSettings: any;
  plugin: any;
  complianceFinding?: any;
};

export const agentDb = prisma as AgentPrismaClient;
