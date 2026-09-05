import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { ShareTokenKeyring } from "../../../../lib/config/share-token-keyring";
import type { ShareTokenCipher } from "../../application/ports/share-token-cipher";
import { isShareToken } from "../../domain/share-token";

export class AesShareTokenCipher implements ShareTokenCipher {
  constructor(private readonly keyring: ShareTokenKeyring) {}

  encrypt(token: string, objectKey: string): string {
    const id = this.keyring.active;
    const iv = randomBytes(12);
    const cipher = createCipheriv(
      "aes-256-gcm",
      Buffer.from(this.keyring.keys[id], "hex"),
      iv,
    );
    cipher.setAAD(Buffer.from(`filedrop:1:${id}:${objectKey}`));
    const ciphertext = Buffer.concat([
      cipher.update(token, "utf8"),
      cipher.final(),
    ]);
    return [
      "1",
      id,
      iv.toString("base64url"),
      cipher.getAuthTag().toString("base64url"),
      ciphertext.toString("base64url"),
    ].join(".");
  }

  decrypt(envelope: string, objectKey: string): string {
    try {
      const parts = envelope.split(".");
      const [version, id, nonce, tag, payload] = parts;
      if (
        parts.length !== 5 ||
        version !== "1" ||
        !Object.hasOwn(this.keyring.keys, id)
      )
        throw new Error();
      const iv = Buffer.from(nonce, "base64url");
      const authTag = Buffer.from(tag, "base64url");
      if (iv.length !== 12 || authTag.length !== 16) throw new Error();
      const decipher = createDecipheriv(
        "aes-256-gcm",
        Buffer.from(this.keyring.keys[id], "hex"),
        iv,
      );
      decipher.setAAD(Buffer.from(`filedrop:1:${id}:${objectKey}`));
      decipher.setAuthTag(authTag);
      const token = Buffer.concat([
        decipher.update(Buffer.from(payload, "base64url")),
        decipher.final(),
      ]).toString("utf8");
      if (!isShareToken(token)) throw new Error();
      return token;
    } catch {
      throw new Error("SHARE_TOKEN_DECRYPTION_FAILED");
    }
  }
}
