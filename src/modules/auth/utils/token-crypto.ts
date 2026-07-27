import { createHash, randomBytes, randomUUID } from "node:crypto";

export function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

export function generateRefreshToken(): string {
  return randomBytes(48).toString("base64url");
}

export function generateAccessTokenJti(): string {
  return randomUUID();
}
