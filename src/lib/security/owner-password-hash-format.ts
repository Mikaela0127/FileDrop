export const OWNER_PASSWORD_HASH_PATTERN =
  /^\$scrypt\$ln=16,r=8,p=1\$[A-Za-z0-9_-]{22}\$[A-Za-z0-9_-]{43}$/u;

export function isOwnerPasswordHash(value: string): boolean {
  if (!OWNER_PASSWORD_HASH_PATTERN.test(value)) {
    return false;
  }

  const [, , , encodedSalt, encodedDigest] = value.split("$");

  try {
    const salt = Buffer.from(encodedSalt, "base64url");
    const digest = Buffer.from(encodedDigest, "base64url");

    return (
      salt.byteLength === 16 &&
      digest.byteLength === 32 &&
      salt.toString("base64url") === encodedSalt &&
      digest.toString("base64url") === encodedDigest
    );
  } catch {
    return false;
  }
}
