import { describe, expect, it, vi } from "vitest";

import {
  parseProductionSmokeBaseUrl,
  ProductionSmokeCheckError,
  ProductionSmokeConfigurationError,
  runProductionSmoke,
} from "./production-smoke";

const baseUrl = new URL("https://filedrop.example.test");
const shareToken = Buffer.alloc(32, 9).toString("base64url");

function securityHeaders(): Record<string, string> {
  return {
    "Content-Security-Policy": "default-src 'self'; frame-ancestors 'none'",
    "Referrer-Policy": "no-referrer",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
  };
}

function responseFor(pathname: string): Response {
  switch (pathname) {
    case "/api/health":
      return Response.json(
        { service: "filedrop", status: "ok" },
        { headers: { "Cache-Control": "no-store" } },
      );
    case "/":
      return new Response("FileDrop", { headers: securityHeaders() });
    case "/api/auth/session":
      return Response.json(
        { authenticated: false },
        { headers: { "Cache-Control": "no-store" } },
      );
    case "/api/files":
      return Response.json(
        { error: { code: "UNAUTHENTICATED" } },
        { headers: { "Cache-Control": "no-store" }, status: 401 },
      );
    case "/api/cron/cleanup":
      return Response.json(
        { error: { code: "UNAUTHORIZED" } },
        {
          headers: {
            "Cache-Control": "no-store",
            "WWW-Authenticate": "Bearer",
          },
          status: 401,
        },
      );
    case `/d/${shareToken}`:
      return new Response("Unavailable", {
        headers: { "Cache-Control": "no-store" },
        status: 404,
      });
    default:
      throw new Error("unexpected smoke-test path");
  }
}

function createSuccessfulFetch() {
  return vi.fn(async (...[input]: [string | URL | Request, RequestInit?]) => {
    const url = new URL(input instanceof Request ? input.url : input);
    return responseFor(url.pathname);
  });
}

describe("production smoke base URL", () => {
  it("accepts an exact public HTTPS origin", () => {
    expect(
      parseProductionSmokeBaseUrl("https://filedrop.mikaela79.com"),
    ).toEqual(new URL("https://filedrop.mikaela79.com"));
  });

  it.each([
    undefined,
    "not a URL",
    "http://filedrop.example.test",
    "https://localhost",
    "https://127.0.0.1",
    "https://user:password@filedrop.example.test",
    "https://filedrop.example.test:8443",
    "https://filedrop.example.test/admin",
    "https://filedrop.example.test?token=secret",
    "https://filedrop.example.test#fragment",
  ])("rejects a non-production target", (value) => {
    expect(() => parseProductionSmokeBaseUrl(value)).toThrow(
      ProductionSmokeConfigurationError,
    );
  });
});

describe("production smoke checks", () => {
  it("checks liveness, headers, and anonymous boundaries without credentials or redirects", async () => {
    const fetchImplementation = createSuccessfulFetch();

    const result = await runProductionSmoke({
      baseUrl,
      fetchImplementation,
      shareToken,
    });

    expect(result.passedChecks).toEqual([
      "application liveness",
      "homepage security policy",
      "anonymous session boundary",
      "owner catalog boundary",
      "cleanup authorization boundary",
      "unknown download boundary",
    ]);
    expect(fetchImplementation).toHaveBeenCalledTimes(6);

    for (const [, init] of fetchImplementation.mock.calls) {
      const headers = new Headers(init?.headers);
      expect(init?.method).toBe("GET");
      expect(init?.redirect).toBe("manual");
      expect(init?.credentials).toBe("omit");
      expect(headers.has("authorization")).toBe(false);
      expect(headers.has("cookie")).toBe(false);
    }
  });

  it("fails safely when a response status is unexpected", async () => {
    const privateResponse = "private upstream response detail";
    const fetchImplementation = vi.fn(async () =>
      Response.json(
        { error: privateResponse },
        { headers: { "Cache-Control": "no-store" }, status: 503 },
      ),
    );

    await expect(
      runProductionSmoke({
        baseUrl,
        fetchImplementation,
        shareToken,
      }),
    ).rejects.toThrow("application liveness: expected HTTP 200");

    try {
      await runProductionSmoke({
        baseUrl,
        fetchImplementation,
        shareToken,
      });
    } catch (error) {
      expect(error).toBeInstanceOf(ProductionSmokeCheckError);
      expect(String(error)).not.toContain(privateResponse);
    }
  });

  it("names a missing security control without returning page content", async () => {
    const fetchImplementation = createSuccessfulFetch();
    fetchImplementation.mockImplementation(async (input) => {
      const url = new URL(input instanceof Request ? input.url : input);

      if (url.pathname === "/") {
        return new Response("private rendered content", {
          headers: {
            ...securityHeaders(),
            "X-Frame-Options": "SAMEORIGIN",
          },
        });
      }

      return responseFor(url.pathname);
    });

    await expect(
      runProductionSmoke({
        baseUrl,
        fetchImplementation,
        shareToken,
      }),
    ).rejects.toThrow(
      "homepage security policy: x-frame-options did not match the production contract",
    );
  });

  it("does not surface network exception details", async () => {
    const fetchImplementation = vi.fn(async () => {
      throw new Error("provider credential appeared in an upstream exception");
    });

    await expect(
      runProductionSmoke({
        baseUrl,
        fetchImplementation,
        shareToken,
      }),
    ).rejects.toThrow(
      "application liveness: request failed or exceeded 10 seconds",
    );
  });
});
