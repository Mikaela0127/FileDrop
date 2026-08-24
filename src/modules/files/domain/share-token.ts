import { createHash, randomBytes } from "node:crypto";

const SHARE_TOKEN_BYTES = 32;

export function generateShareToken(): string {
  return randomBytes(SHARE_TOKEN_BYTES).toString("base64url");
}

export function hashShareToken(shareToken: string): string {
  return createHash("sha256").update(shareToken, "utf8").digest("hex");
}
