import jwt from "jsonwebtoken";
import { z } from "zod";
import { appConfig } from "../../../config/app.config.js";
import { UnauthorizedError } from "../../../shared/errors/app-error.js";
import { generateAccessTokenJti } from "./token-crypto.js";

export const accessTokenPayloadSchema = z.object({
  sub: z.string().uuid(),
  organizationId: z.string().uuid(),
  permissions: z.array(z.string()),
  roles: z.array(z.string()),
  mfaVerified: z.boolean().optional(),
  jti: z.string().min(1),
});

export type AccessTokenPayload = z.infer<typeof accessTokenPayloadSchema>;

export type SignAccessTokenInput = {
  actorUserId: string;
  organizationId: string;
  permissions: readonly string[];
  roles: readonly string[];
  mfaVerified?: boolean;
  jti?: string;
  expiresInSeconds?: number;
};

export function signAccessToken(input: SignAccessTokenInput): string {
  const jti = input.jti ?? generateAccessTokenJti();
  const payload: AccessTokenPayload = {
    sub: input.actorUserId,
    organizationId: input.organizationId,
    permissions: [...input.permissions],
    roles: [...input.roles],
    jti,
    ...(input.mfaVerified !== undefined ? { mfaVerified: input.mfaVerified } : {}),
  };

  return jwt.sign(payload, appConfig.jwt.accessSecret, {
    expiresIn: input.expiresInSeconds ?? appConfig.jwt.accessTtlSeconds,
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    const decoded = jwt.verify(token, appConfig.jwt.accessSecret);
    const parsed = accessTokenPayloadSchema.safeParse(decoded);
    if (!parsed.success) {
      throw new UnauthorizedError("Invalid access token claims");
    }
    return parsed.data;
  } catch (err) {
    if (err instanceof UnauthorizedError) throw err;
    throw new UnauthorizedError("Invalid or expired access token");
  }
}

export function extractBearerToken(authorizationHeader: string | undefined): string | null {
  if (!authorizationHeader) return null;
  const [scheme, token] = authorizationHeader.split(" ");
  if (!scheme || !token || scheme.toLowerCase() !== "bearer") {
    return null;
  }
  return token.trim() || null;
}

export function decodeAccessTokenUnsafe(token: string): AccessTokenPayload | null {
  try {
    const decoded = jwt.decode(token);
    const parsed = accessTokenPayloadSchema.safeParse(decoded);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
