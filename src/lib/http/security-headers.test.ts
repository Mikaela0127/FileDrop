import { describe, expect, it } from "vitest";

import { createSecurityHeaders } from "./security-headers";

function asRecord(isDevelopment: boolean): Record<string, string> {
  return Object.fromEntries(
    createSecurityHeaders({ isDevelopment }).map(({ key, value }) => [
      key,
      value,
    ]),
  );
}

describe("security headers", () => {
  it("locks down production responses while permitting direct R2 transfers", () => {
    const headers = asRecord(false);

    expect(headers).toMatchObject({
      "Cross-Origin-Opener-Policy": "same-origin",
      "Referrer-Policy": "no-referrer",
      "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
    });
    expect(headers["Content-Security-Policy"]).toContain(
      "connect-src 'self' https://*.r2.cloudflarestorage.com",
    );
    expect(headers["Content-Security-Policy"]).toContain(
      "frame-ancestors 'none'",
    );
    expect(headers["Content-Security-Policy"]).toContain(
      "upgrade-insecure-requests",
    );
    expect(headers["Content-Security-Policy"]).not.toContain("'unsafe-eval'");
  });

  it("permits Next.js development sockets without advertising HSTS", () => {
    const headers = asRecord(true);

    expect(headers).not.toHaveProperty("Strict-Transport-Security");
    expect(headers["Content-Security-Policy"]).toContain("'unsafe-eval'");
    expect(headers["Content-Security-Policy"]).toContain("ws: wss:");
    expect(headers["Content-Security-Policy"]).not.toContain(
      "upgrade-insecure-requests",
    );
  });

  it("does not enable browser capabilities that FileDrop does not use", () => {
    const permissionsPolicy = asRecord(false)["Permissions-Policy"];

    expect(permissionsPolicy).toContain("camera=()");
    expect(permissionsPolicy).toContain("geolocation=()");
    expect(permissionsPolicy).toContain("microphone=()");
    expect(permissionsPolicy).toContain("payment=()");
  });
});
