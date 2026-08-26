import { describe, expect, it, vi } from "vitest";

import {
  createOwnerAuthentication,
  InvalidOwnerCredentialsError,
  OwnerAuthenticationBusyError,
} from "./owner-authentication";
import { PasswordVerificationBusyError } from "./ports/owner-password-verifier";
import type { OwnerSessionManager } from "./ports/owner-session-manager";

const ownerSession = {
  token: "signed-owner-session",
  expiresAt: new Date("2026-08-26T16:00:00.000Z"),
};

function createHarness(passwordMatches = true) {
  const passwordVerifier = {
    verify: vi.fn(async () => passwordMatches),
  };
  const sessionManager: OwnerSessionManager = {
    issue: vi.fn(async () => ownerSession),
    verify: vi.fn(async (token) => token === ownerSession.token),
  };
  const authentication = createOwnerAuthentication({
    passwordVerifier,
    sessionManager,
  });

  return { authentication, passwordVerifier, sessionManager };
}

describe("owner authentication", () => {
  it("issues a session only after the configured password matches", async () => {
    const harness = createHarness();

    await expect(
      harness.authentication.authenticate("correct horse battery staple"),
    ).resolves.toEqual(ownerSession);
    expect(harness.passwordVerifier.verify).toHaveBeenCalledWith(
      "correct horse battery staple",
    );
    expect(harness.sessionManager.issue).toHaveBeenCalledOnce();
  });

  it("returns a generic credential error without issuing a session", async () => {
    const harness = createHarness(false);

    await expect(
      harness.authentication.authenticate("incorrect password"),
    ).rejects.toThrowError(InvalidOwnerCredentialsError);
    expect(harness.sessionManager.issue).not.toHaveBeenCalled();
  });

  it("rejects oversized input before starting expensive password work", async () => {
    const harness = createHarness();

    await expect(
      harness.authentication.authenticate("p".repeat(1_025)),
    ).rejects.toThrowError(InvalidOwnerCredentialsError);
    expect(harness.passwordVerifier.verify).not.toHaveBeenCalled();
  });

  it("maps password capacity exhaustion without treating it as bad credentials", async () => {
    const harness = createHarness();
    harness.passwordVerifier.verify.mockRejectedValueOnce(
      new PasswordVerificationBusyError(),
    );

    await expect(
      harness.authentication.authenticate("correct horse battery staple"),
    ).rejects.toThrowError(OwnerAuthenticationBusyError);
    expect(harness.sessionManager.issue).not.toHaveBeenCalled();
  });

  it("delegates session verification to the session manager", async () => {
    const harness = createHarness();

    await expect(
      harness.authentication.isAuthenticated(ownerSession.token),
    ).resolves.toBe(true);
    await expect(
      harness.authentication.isAuthenticated(undefined),
    ).resolves.toBe(false);
  });
});
