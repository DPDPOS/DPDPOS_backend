import { prisma } from "../infrastructure/database/prisma-client.js";

export class TenantContextResolver {
  async load(organizationId: string) {
    return prisma.organizationControlPlaneSettings.findUnique({
      where: { organizationId },
    });
  }

  async isAgentModeEnabled(organizationId: string): Promise<boolean> {
    const settings = await this.load(organizationId);
    return settings?.discoveryEnabled === true;
  }
}

export const tenantContextResolver = new TenantContextResolver();
