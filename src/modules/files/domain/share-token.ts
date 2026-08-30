import { createHash, randomBytes } from "node:crypto";

const SHARE_TOKEN_BYTES = 32;
const SHARE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/u;

export function generateShareToken(): string {
  return randomBytes(SHARE_TOKEN_BYTES).toString("base64url");
}

export function hashShareToken(shareToken: string): string {
  return createHash("sha256").update(shareToken, "utf8").digest("hex");
}

export function isShareToken(value: unknown): value is string {
  if (typeof value !== "string" || !SHARE_TOKEN_PATTERN.test(value)) {
    return false;
  }

  const decoded = Buffer.from(value, "base64url");
  return (
    decoded.byteLength === SHARE_TOKEN_BYTES &&
    decoded.toString("base64url") === value
  );
}
