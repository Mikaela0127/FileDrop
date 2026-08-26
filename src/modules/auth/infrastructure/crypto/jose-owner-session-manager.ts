import { randomUUID } from "node:crypto";

import { jwtVerify, SignJWT } from "jose";

import type {
  OwnerSession,
  OwnerSessionManager,
} from "../../application/ports/owner-session-manager";

export const OWNER_SESSION_TTL_SECONDS = 8 * 60 * 60;

const SESSION_ALGORITHM = "HS256";
const SESSION_AUDIENCE = "filedrop-owner";
const SESSION_ISSUER = "filedrop";
const SESSION_SUBJECT = "owner";
const SESSION_ROLE = "owner";
const SESSION_CLOCK_TOLERANCE_SECONDS = 5;
const MAX_SESSION_TOKEN_LENGTH = 2_048;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export interface JoseOwnerSessionManagerDependencies {
  clock?: () => Date;
  createSessionId?: () => string;
}

export class InvalidOwnerSessionSecretError extends Error {
  constructor() {
    super("Owner session secret must contain at least 32 UTF-8 bytes");
    this.name = "InvalidOwnerSessionSecretError";
  }
}

export class JoseOwnerSessionManager implements OwnerSessionManager {
  private readonly clock: () => Date;
  private readonly createSessionId: () => string;
  private readonly signingKey: Uint8Array;

  constructor(
    sessionSecret: string,
    dependencies: JoseOwnerSessionManagerDependencies = {},
  ) {
    const signingKey = new TextEncoder().encode(sessionSecret);

    if (signingKey.byteLength < 32) {
      throw new InvalidOwnerSessionSecretError();
    }

    this.clock = dependencies.clock ?? (() => new Date());
    this.createSessionId = dependencies.createSessionId ?? randomUUID;
    this.signingKey = signingKey;
  }

  async issue(): Promise<OwnerSession> {
    const now = this.clock();
    const issuedAt = Math.floor(now.getTime() / 1_000);
    const expiresAt = issuedAt + OWNER_SESSION_TTL_SECONDS;
    const sessionId = this.createSessionId();

    if (!Number.isFinite(now.getTime()) || !UUID.test(sessionId)) {
      throw new TypeError("Cannot issue owner session");
    }

    const token = await new SignJWT({ role: SESSION_ROLE })
      .setProtectedHeader({ alg: SESSION_ALGORITHM, typ: "JWT" })
      .setIssuer(SESSION_ISSUER)
      .setAudience(SESSION_AUDIENCE)
      .setSubject(SESSION_SUBJECT)
      .setJti(sessionId)
      .setIssuedAt(issuedAt)
      .setExpirationTime(expiresAt)
      .sign(this.signingKey);

    return {
      token,
      expiresAt: new Date(expiresAt * 1_000),
    };
  }

  async verify(token: string | undefined): Promise<boolean> {
    if (!token || token.length > MAX_SESSION_TOKEN_LENGTH) {
      return false;
    }

    try {
      const verificationTime = this.clock();
      const { payload, protectedHeader } = await jwtVerify(
        token,
        this.signingKey,
        {
          algorithms: [SESSION_ALGORITHM],
          audience: SESSION_AUDIENCE,
          clockTolerance: SESSION_CLOCK_TOLERANCE_SECONDS,
          currentDate: verificationTime,
          issuer: SESSION_ISSUER,
          requiredClaims: ["exp", "iat", "jti", "sub"],
          subject: SESSION_SUBJECT,
        },
      );
      const now = Math.floor(verificationTime.getTime() / 1_000);

      return (
        protectedHeader.typ === "JWT" &&
        payload.role === SESSION_ROLE &&
        typeof payload.iat === "number" &&
        typeof payload.exp === "number" &&
        payload.exp - payload.iat === OWNER_SESSION_TTL_SECONDS &&
        payload.iat <= now + SESSION_CLOCK_TOLERANCE_SECONDS &&
        typeof payload.jti === "string" &&
        UUID.test(payload.jti)
      );
    } catch {
      return false;
    }
  }
}
