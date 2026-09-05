import { describe, expect, it } from "vitest";
import { AesShareTokenCipher } from "./aes-share-token-cipher";
import { generateShareToken } from "../../domain/share-token";
import { parseShareTokenKeyring } from "../../../../lib/config/share-token-keyring";

const keys = {
  first: Buffer.alloc(32, 1).toString("hex"),
  second: Buffer.alloc(32, 2).toString("hex"),
};
describe("recoverable share tokens", () => {
  it("encrypts with a fresh nonce and authenticates the file identity", () => {
    const cipher = new AesShareTokenCipher({ active: "first", keys });
    const token = generateShareToken();
    const sealed = cipher.encrypt(token, "objects/one");
    expect(sealed).not.toContain(token);
    expect(cipher.encrypt(token, "objects/one")).not.toBe(sealed);
    expect(cipher.decrypt(sealed, "objects/one")).toBe(token);
    expect(() => cipher.decrypt(sealed, "objects/two")).toThrow(
      "SHARE_TOKEN_DECRYPTION_FAILED",
    );
    const parts = sealed.split(".");
    parts[4] = Buffer.alloc(43, 3).toString("base64url");
    expect(() => cipher.decrypt(parts.join("."), "objects/one")).toThrow();
  });
  it("keeps old keys usable after selecting a new active key", () => {
    const previous = new AesShareTokenCipher({ active: "first", keys });
    const current = new AesShareTokenCipher({ active: "second", keys });
    const token = generateShareToken();
    expect(current.decrypt(previous.encrypt(token, "object"), "object")).toBe(
      token,
    );
    expect(current.encrypt(token, "object")).toMatch(/^1\.second\./u);
    expect(() =>
      new AesShareTokenCipher({
        active: "second",
        keys: { second: keys.second },
      }).decrypt(previous.encrypt(token, "object"), "object"),
    ).toThrow();
  });
  it.each([
    undefined,
    "private-invalid-value",
    "{}",
    JSON.stringify({ active: "missing", keys }),
    JSON.stringify({ active: "first", keys: { first: "secret" } }),
  ])("rejects malformed keyrings without disclosing their value", (value) => {
    expect(() => parseShareTokenKeyring(value)).toThrow(
      "SHARE_TOKEN_KEYRING must contain",
    );
    try {
      parseShareTokenKeyring(value);
    } catch (error) {
      if (value) expect(String(error)).not.toContain(value);
    }
  });
});
