import { describe, expect, it } from "vitest";

import { PasswordVerificationBusyError } from "../../application/ports/owner-password-verifier";
import {
  hashOwnerPassword,
  InvalidNewOwnerPasswordError,
  InvalidOwnerPasswordHashError,
  ScryptOwnerPasswordVerifier,
} from "./scrypt-owner-password";

describe("scrypt owner passwords", () => {
  it("hashes and verifies a password without storing the cleartext", async () => {
    const password = "correct horse battery staple";
    const encodedHash = await hashOwnerPassword(password, {
      createSalt: () => Buffer.alloc(16, 7),
    });
    const verifier = new ScryptOwnerPasswordVerifier(encodedHash);

    expect(encodedHash).toMatch(/^\$scrypt\$ln=16,r=8,p=1\$/u);
    expect(encodedHash).not.toContain(password);
    await expect(verifier.verify(password)).resolves.toBe(true);
    await expect(verifier.verify("incorrect password")).resolves.toBe(false);
  });

  it.each(["short", "p".repeat(1_025)])(
    "rejects an unsafe new password length",
    async (password) => {
      await expect(hashOwnerPassword(password)).rejects.toThrowError(
        InvalidNewOwnerPasswordError,
      );
    },
  );

  it("rejects malformed configured hashes before verification", () => {
    expect(
      () => new ScryptOwnerPasswordVerifier("$2b$12$unsupported"),
    ).toThrowError(InvalidOwnerPasswordHashError);
  });

  it("bounds concurrent memory-intensive verification work", async () => {
    const expectedDigest = Buffer.alloc(32, 2);
    const encodedHash = `$scrypt$ln=16,r=8,p=1$${Buffer.alloc(16, 1).toString("base64url")}$${expectedDigest.toString("base64url")}`;
    let releaseDerivation: ((digest: Uint8Array) => void) | undefined;
    const verifier = new ScryptOwnerPasswordVerifier(encodedHash, {
      maxConcurrentVerifications: 1,
      deriveKey: async () =>
        new Promise<Uint8Array>((resolve) => {
          releaseDerivation = resolve;
        }),
    });

    const firstVerification = verifier.verify("first password attempt");
    await expect(
      verifier.verify("second password attempt"),
    ).rejects.toThrowError(PasswordVerificationBusyError);

    expect(releaseDerivation).toBeTypeOf("function");
    releaseDerivation?.(expectedDigest);
    await expect(firstVerification).resolves.toBe(true);
  });
});
