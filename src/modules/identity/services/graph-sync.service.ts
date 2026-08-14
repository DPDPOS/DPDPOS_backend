import { decryptSecret } from "../../auth/utils/secret-crypto.js";
import { NotFoundError, ValidationError } from "../../../shared/errors/app-error.js";
import { prisma } from "../../../infrastructure/database/prisma-client.js";
import { identityProviderRepository } from "../repositories/identity-provider.repository.js";
import { federatedUserService } from "./federated-user.service.js";

type GraphGroup = { id?: string; displayName?: string };

async function clientCredentialsToken(input: {
  tenantId: string;
  clientId: string;
  clientSecret: string;
}): Promise<string> {
  const tokenUrl = `https://login.microsoftonline.com/${input.tenantId}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: input.clientId,
    client_secret: input.clientSecret,
    scope: "https://graph.microsoft.com/.default",
  });
  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    throw new ValidationError(
      "Entra client-credentials token failed. Grant Application permission GroupMember.Read.All and admin consent.",
    );
  }
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) {
    throw new ValidationError("Entra token response missing access_token");
  }
  return json.access_token;
}

export async function fetchGraphMemberGroups(
  accessToken: string,
  path: string,
): Promise<string[]> {
  const keys: string[] = [];
  let url: string | null =
    path.startsWith("http") ? path : `https://graph.microsoft.com/v1.0/${path.replace(/^\//, "")}`;
  let pages = 0;
  while (url && pages < 10) {
    pages += 1;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) break;
    const json = (await res.json()) as {
      value?: GraphGroup[];
      "@odata.nextLink"?: string;
    };
    for (const row of json.value ?? []) {
      if (row.id) keys.push(row.id);
      if (row.displayName) keys.push(row.displayName);
    }
    url = json["@odata.nextLink"] ?? null;
  }
  return keys;
}

export class GraphSyncService {
  async syncOrganization(organizationId: string): Promise<{
    usersUpdated: number;
    errorMessage: string | null;
  }> {
    const provider = await identityProviderRepository.findEnabledByType(organizationId, "OIDC");
    if (!provider?.tenantId || !provider.clientId || !provider.clientSecretEnc) {
      throw new NotFoundError("No enabled Entra OIDC provider with tenant, client id, and secret");
    }

    const token = await clientCredentialsToken({
      tenantId: provider.tenantId,
      clientId: provider.clientId,
      clientSecret: decryptSecret(provider.clientSecretEnc),
    });

    const users = await prisma.user.findMany({
      where: {
        organizationId,
        deletedAt: null,
        status: { not: "DISABLED" },
        authSource: "OIDC",
        externalSubject: { not: null },
      },
      select: { id: true, externalSubject: true },
    });

    let usersUpdated = 0;
    let errorMessage: string | null = null;

    for (const user of users) {
      if (!user.externalSubject) continue;
      try {
        const groupIds = await fetchGraphMemberGroups(
          token,
          `users/${encodeURIComponent(user.externalSubject)}/memberOf?$select=id,displayName`,
        );
        await federatedUserService.applyGroupRoles({
          organizationId,
          providerId: provider.id,
          userId: user.id,
          groupIds,
        });
        usersUpdated += 1;
      } catch (err) {
        errorMessage = err instanceof Error ? err.message : "Graph group sync failed";
      }
    }

    return { usersUpdated, errorMessage };
  }
}

export const graphSyncService = new GraphSyncService();
