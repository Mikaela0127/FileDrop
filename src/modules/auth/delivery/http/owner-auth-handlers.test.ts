import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

import {
  InvalidOwnerCredentialsError,
  OwnerAuthenticationBusyError,
  type OwnerAuthentication,
} from "../../application/owner-authentication";
import {
  createOwnerAuthHttpHandlers,
  OWNER_SESSION_COOKIE_NAME,
} from "./owner-auth-handlers";

const appOrigin = "https://filedrop.example.test";
const ownerSession = {
  token: "signed-owner-session-token",
  expiresAt: new Date("2026-08-26T16:00:00.000Z"),
};
const untrustedMutationHeaders: Record<string, string>[] = [
  {},
  { origin: "https://attacker.example" },
  { "sec-fetch-site": "cross-site" },
];

function createHarness(secureCookies = true) {
  const authentication: OwnerAuthentication = {
    authenticate: vi.fn(async () => ownerSession),
    isAuthenticated: vi.fn(async (token) => token === ownerSession.token),
  };
  const handlers = createOwnerAuthHttpHandlers({
    appOrigin,
    authentication,
    secureCookies,
  });

  return { authentication, handlers };
}

function loginRequest(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(`${appOrigin}/api/auth/login`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: appOrigin,
      "sec-fetch-site": "same-origin",
      ...headers,
    },
    body: JSON.stringify({ password: "correct horse battery staple" }),
  });
}

function mutationRequest(path: string, headers: Record<string, string> = {}) {
  return new NextRequest(`${appOrigin}${path}`, {
    method: "POST",
    headers: {
      origin: appOrigin,
      "sec-fetch-site": "same-origin",
      ...headers,
    },
  });
}

describe("owner auth HTTP handlers", () => {
  it("sets a hardened cookie after successful login without returning its token", async () => {
    const harness = createHarness();

    const response = await harness.handlers.login(loginRequest());
    const body = await response.json();
    const setCookie = response.headers.get("set-cookie") ?? "";

    expect(response.status).toBe(200);
    expect(body).toEqual({
      authenticated: true,
      expiresAt: ownerSession.expiresAt.toISOString(),
    });
    expect(JSON.stringify(body)).not.toContain(ownerSession.token);
    expect(setCookie).toContain(
      `${OWNER_SESSION_COOKIE_NAME}=${ownerSession.token}`,
    );
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Secure");
    expect(setCookie).toContain("SameSite=strict");
    expect(setCookie).toContain("Path=/");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it.each(untrustedMutationHeaders)(
    "rejects an untrusted mutation origin",
    async (headers) => {
      const harness = createHarness();
      const request = loginRequest(headers);

      if (Object.keys(headers).length === 0) {
        request.headers.delete("origin");
      }

      const response = await harness.handlers.login(request);

      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toEqual({
        error: { code: "FORBIDDEN_ORIGIN" },
      });
      expect(harness.authentication.authenticate).not.toHaveBeenCalled();
    },
  );

  it("returns a generic error and no cookie for invalid credentials", async () => {
    const harness = createHarness();
    vi.mocked(harness.authentication.authenticate).mockRejectedValueOnce(
      new InvalidOwnerCredentialsError(),
    );

    const response = await harness.handlers.login(loginRequest());

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: { code: "INVALID_CREDENTIALS" },
    });
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("applies back-pressure when password verification capacity is full", async () => {
    const harness = createHarness();
    vi.mocked(harness.authentication.authenticate).mockRejectedValueOnce(
      new OwnerAuthenticationBusyError(),
    );

    const response = await harness.handlers.login(loginRequest());

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("5");
  });

  it("clears the session cookie only for a trusted logout request", async () => {
    const harness = createHarness();
    const response = await harness.handlers.logout(
      mutationRequest("/api/auth/logout"),
    );
    const setCookie = response.headers.get("set-cookie") ?? "";

    expect(response.status).toBe(200);
    expect(setCookie).toContain(`${OWNER_SESSION_COOKIE_NAME}=`);
    expect(setCookie).toContain("Max-Age=0");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=strict");
  });

  it("reports session state from the signed cookie without caching", async () => {
    const harness = createHarness();
    const request = new NextRequest(`${appOrigin}/api/auth/session`, {
      headers: {
        cookie: `${OWNER_SESSION_COOKIE_NAME}=${ownerSession.token}`,
      },
    });

    const response = await harness.handlers.session(request);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ authenticated: true });
    expect(harness.authentication.isAuthenticated).toHaveBeenCalledWith(
      ownerSession.token,
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("does not mark a local-development cookie as Secure", async () => {
    const harness = createHarness(false);

    const response = await harness.handlers.login(loginRequest());

    expect(response.headers.get("set-cookie")).not.toContain("Secure");
  });
});
