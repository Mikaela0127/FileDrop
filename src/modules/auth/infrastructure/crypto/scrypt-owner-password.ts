import {
  randomBytes,
  scrypt,
  timingSafeEqual,
  type ScryptOptions,
} from "node:crypto";

import {
  PasswordVerificationBusyError,
  type OwnerPasswordVerifier,
} from "../../application/ports/owner-password-verifier";
import { isOwnerPasswordHash } from "../../../../lib/security/owner-password-hash-format";

const SCRYPT_KEY_LENGTH = 32;
const SCRYPT_SALT_LENGTH = 16;
const MIN_NEW_PASSWORD_BYTES = 12;
const MAX_PASSWORD_BYTES = 1_024;
const SCRYPT_PARAMETER_LABEL = "ln=16,r=8,p=1";
const SCRYPT_OPTIONS: ScryptOptions = {
  N: 2 ** 16,
  r: 8,
  p: 1,
  maxmem: 128 * 1024 * 1024,
};

type DeriveKey = (password: string, salt: Uint8Array) => Promise<Uint8Array>;

export interface ScryptOwnerPasswordVerifierDependencies {
  deriveKey?: DeriveKey;
  maxConcurrentVerifications?: number;
}

export interface HashOwnerPasswordDependencies {
  createSalt?: () => Uint8Array;
  deriveKey?: DeriveKey;
}

export class InvalidOwnerPasswordHashError extends Error {
  constructor() {
    super("Invalid owner password hash configuration");
    this.name = "InvalidOwnerPasswordHashError";
  }
}

export class InvalidNewOwnerPasswordError extends Error {
  constructor() {
    super(
      `Owner password must contain between ${MIN_NEW_PASSWORD_BYTES} and ${MAX_PASSWORD_BYTES} UTF-8 bytes`,
    );
    this.name = "InvalidNewOwnerPasswordError";
  }
}

function deriveScryptKey(
  password: string,
  salt: Uint8Array,
): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      SCRYPT_KEY_LENGTH,
      SCRYPT_OPTIONS,
      (error, derivedKey) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(derivedKey);
      },
    );
  });
}

function decodeCanonicalBase64Url(value: string): Uint8Array | undefined {
  try {
    const decodedValue = Buffer.from(value, "base64url");
    return decodedValue.toString("base64url") === value
      ? decodedValue
      : undefined;
  } catch {
    return undefined;
  }
}

function parseOwnerPasswordHash(encodedHash: string): {
  digest: Uint8Array;
  salt: Uint8Array;
} {
  if (!isOwnerPasswordHash(encodedHash)) {
    throw new InvalidOwnerPasswordHashError();
  }

  const [, algorithm, parameters, encodedSalt, encodedDigest] =
    encodedHash.split("$");
  const salt = decodeCanonicalBase64Url(encodedSalt);
  const digest = decodeCanonicalBase64Url(encodedDigest);

  if (
    algorithm !== "scrypt" ||
    parameters !== SCRYPT_PARAMETER_LABEL ||
    !salt ||
    salt.byteLength !== SCRYPT_SALT_LENGTH ||
    !digest ||
    digest.byteLength !== SCRYPT_KEY_LENGTH
  ) {
    throw new InvalidOwnerPasswordHashError();
  }

  return { digest, salt };
}

function isAllowedNewPassword(password: string): boolean {
  const byteLength = new TextEncoder().encode(password).byteLength;
  return (
    byteLength >= MIN_NEW_PASSWORD_BYTES && byteLength <= MAX_PASSWORD_BYTES
  );
}

export async function hashOwnerPassword(
  password: string,
  dependencies: HashOwnerPasswordDependencies = {},
): Promise<string> {
  if (!isAllowedNewPassword(password)) {
    throw new InvalidNewOwnerPasswordError();
  }

  const salt = dependencies.createSalt?.() ?? randomBytes(SCRYPT_SALT_LENGTH);

  if (salt.byteLength !== SCRYPT_SALT_LENGTH) {
    throw new InvalidOwnerPasswordHashError();
  }

  const digest = await (dependencies.deriveKey ?? deriveScryptKey)(
    password,
    salt,
  );

  if (digest.byteLength !== SCRYPT_KEY_LENGTH) {
    throw new InvalidOwnerPasswordHashError();
  }

  return `$scrypt$${SCRYPT_PARAMETER_LABEL}$${Buffer.from(salt).toString("base64url")}$${Buffer.from(digest).toString("base64url")}`;
}

export class ScryptOwnerPasswordVerifier implements OwnerPasswordVerifier {
  private readonly digest: Uint8Array;
  private readonly salt: Uint8Array;
  private readonly deriveKey: DeriveKey;
  private readonly maxConcurrentVerifications: number;
  private activeVerifications = 0;

  constructor(
    encodedHash: string,
    dependencies: ScryptOwnerPasswordVerifierDependencies = {},
  ) {
    const parsedHash = parseOwnerPasswordHash(encodedHash);
    const maxConcurrentVerifications =
      dependencies.maxConcurrentVerifications ?? 2;

    if (
      !Number.isSafeInteger(maxConcurrentVerifications) ||
      maxConcurrentVerifications < 1
    ) {
      throw new TypeError(
        "maxConcurrentVerifications must be a positive integer",
      );
    }

    this.digest = parsedHash.digest;
    this.salt = parsedHash.salt;
    this.deriveKey = dependencies.deriveKey ?? deriveScryptKey;
    this.maxConcurrentVerifications = maxConcurrentVerifications;
  }

  async verify(password: string): Promise<boolean> {
    if (this.activeVerifications >= this.maxConcurrentVerifications) {
      throw new PasswordVerificationBusyError();
    }

    this.activeVerifications += 1;

    try {
      const candidateDigest = await this.deriveKey(password, this.salt);

      if (candidateDigest.byteLength !== this.digest.byteLength) {
        return false;
      }

      return timingSafeEqual(candidateDigest, this.digest);
    } finally {
      this.activeVerifications -= 1;
    }
  }
}
