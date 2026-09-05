export interface ShareTokenKeyring {
  active: string;
  keys: Record<string, string>;
}

export function parseShareTokenKeyring(
  value: string | undefined,
): ShareTokenKeyring {
  try {
    const parsed: unknown = JSON.parse(value ?? "");
    if (!parsed || typeof parsed !== "object") throw new Error();
    const { active, keys } = parsed as Partial<ShareTokenKeyring>;
    if (
      typeof active !== "string" ||
      !keys ||
      typeof keys !== "object" ||
      Array.isArray(keys)
    )
      throw new Error();
    const entries = Object.entries(keys);
    if (
      entries.length < 1 ||
      entries.length > 10 ||
      !Object.hasOwn(keys, active)
    )
      throw new Error();
    for (const [id, key] of entries) {
      if (
        !/^[a-zA-Z0-9_-]{1,32}$/u.test(id) ||
        typeof key !== "string" ||
        !/^[a-f0-9]{64}$/iu.test(key)
      )
        throw new Error();
    }
    return { active, keys };
  } catch {
    // Never include the supplied JSON or cryptographic key in validation errors.
    throw new Error(
      "SHARE_TOKEN_KEYRING must contain an active key id and 32-byte hexadecimal keys",
    );
  }
}

export function isShareTokenKeyring(value: string): boolean {
  try {
    parseShareTokenKeyring(value);
    return true;
  } catch {
    return false;
  }
}
