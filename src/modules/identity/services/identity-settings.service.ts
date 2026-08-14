import type { UpdateIdentitySettingsDto } from "../dto/identity.dto.js";
import { identitySettingsRepository } from "../repositories/identity-settings.repository.js";
import { identityProviderRepository } from "../repositories/identity-provider.repository.js";

export class IdentitySettingsService {
  getOrCreate(organizationId: string) {
    return identitySettingsRepository.getOrCreate(organizationId);
  }

  async getPublicOptions(organizationId: string) {
    const settings = await identitySettingsRepository.getOrCreate(organizationId);
    const providers = await identityProviderRepository.list(organizationId);
    const enabled = providers.filter((p) => p.enabled);
    return {
      mode: settings.mode,
      enforceSso: settings.enforceSso,
      allowLocalBreakGlass: settings.allowLocalBreakGlass,
      oidcEnabled: enabled.some((p) => p.type === "OIDC"),
      ldapEnabled: enabled.some((p) => p.type === "LDAP"),
      samlEnabled: enabled.some((p) => p.type === "SAML"),
      providers: enabled.map((p) => ({
        id: p.id,
        type: p.type,
        name: p.name,
      })),
    };
  }

  update(organizationId: string, dto: UpdateIdentitySettingsDto) {
    return identitySettingsRepository.update(organizationId, {
      ...(dto.mode !== undefined ? { mode: dto.mode } : {}),
      ...(dto.enforceSso !== undefined ? { enforceSso: dto.enforceSso } : {}),
      ...(dto.allowLocalBreakGlass !== undefined
        ? { allowLocalBreakGlass: dto.allowLocalBreakGlass }
        : {}),
      ...(dto.disableLocalTotpWhenFederated !== undefined
        ? { disableLocalTotpWhenFederated: dto.disableLocalTotpWhenFederated }
        : {}),
      ...(dto.jitProvisioningEnabled !== undefined
        ? { jitProvisioningEnabled: dto.jitProvisioningEnabled }
        : {}),
      ...(dto.defaultRoleName !== undefined
        ? { defaultRoleName: dto.defaultRoleName }
        : {}),
    });
  }
}

export const identitySettingsService = new IdentitySettingsService();
