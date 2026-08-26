import { describe, expect, it } from "vitest";

import {
  InvalidOwnerSessionSecretError,
  JoseOwnerSessionManager,
  OWNER_SESSION_TTL_SECONDS,
} from "./jose-owner-session-manager";

const sessionSecret = "test-session-secret-that-is-at-least-32-bytes";
const sessionId = "123e4567-e89b-42d3-a456-426614174000";

describe("JOSE owner session manager", () => {
  it("issues a signed session with an exact eight-hour lifetime", async () => {
    const now = new Date("2026-08-26T08:00:00.000Z");
    const manager = new JoseOwnerSessionManager(sessionSecret, {
      clock: () => now,
      createSessionId: () => sessionId,
    });

    const session = await manager.issue();

    expect(session.expiresAt).toEqual(
      new Date(now.getTime() + OWNER_SESSION_TTL_SECONDS * 1_000),
    );
    await expect(manager.verify(session.token)).resolves.toBe(true);
    expect(session.token).not.toContain(sessionSecret);
  });

  it("rejects tampered, absent, and oversized tokens", async () => {
    const manager = new JoseOwnerSessionManager(sessionSecret, {
      clock: () => new Date("2026-08-26T08:00:00.000Z"),
      createSessionId: () => sessionId,
    });
    const session = await manager.issue();
    const tamperedToken = `${session.token.slice(0, -1)}x`;

    await expect(manager.verify(tamperedToken)).resolves.toBe(false);
    await expect(manager.verify(undefined)).resolves.toBe(false);
    await expect(manager.verify("x".repeat(2_049))).resolves.toBe(false);
  });

  it("rejects an expired session and a session signed by another key", async () => {
    let now = new Date("2026-08-26T08:00:00.000Z");
    const manager = new JoseOwnerSessionManager(sessionSecret, {
      clock: () => now,
      createSessionId: () => sessionId,
    });
    const session = await manager.issue();
    const otherManager = new JoseOwnerSessionManager("o".repeat(32), {
      clock: () => now,
    });

    await expect(otherManager.verify(session.token)).resolves.toBe(false);

    now = new Date(now.getTime() + (OWNER_SESSION_TTL_SECONDS + 10) * 1_000);
    await expect(manager.verify(session.token)).resolves.toBe(false);
  });

  it("refuses a short signing secret", () => {
    expect(() => new JoseOwnerSessionManager("too-short")).toThrowError(
      InvalidOwnerSessionSecretError,
    );
  });

  it("refuses to issue sessions with malformed identifiers", async () => {
    const manager = new JoseOwnerSessionManager(sessionSecret, {
      createSessionId: () => "predictable-session-id",
    });

    await expect(manager.issue()).rejects.toThrow("Cannot issue owner session");
  });
});
