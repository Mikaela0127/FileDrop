import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

import type { OwnerAuthentication } from "../../../auth/application/owner-authentication";
import { OWNER_SESSION_COOKIE_NAME } from "../../../auth/delivery/http/owner-auth-handlers";
import { createOwnerFileCatalogHttpHandler } from "./owner-file-catalog-handler";

const appOrigin = "https://filedrop.example.test";
const file = {
  id: "123e4567-e89b-42d3-a456-426614174001",
  originalName: "architecture.pdf",
  contentType: "application/pdf",
  sizeBytes: 42,
  status: "READY" as const,
  expiresAt: new Date("2026-09-02T08:00:00.000Z"),
  downloadCount: 3,
  lastDownloadedAt: new Date("2026-09-01T09:00:00.000Z"),
  createdAt: new Date("2026-09-01T07:59:00.000Z"),
};

function request(session = "owner-session") {
  return new NextRequest(`${appOrigin}/api/files`, {
    headers: session
      ? { cookie: `${OWNER_SESSION_COOKIE_NAME}=${session}` }
      : {},
  });
}

function createHarness() {
  const authentication: OwnerAuthentication = {
    authenticate: vi.fn(async () => {
      throw new Error("not used");
    }),
    isAuthenticated: vi.fn(async (token) => token === "owner-session"),
  };
  const listOwnerFiles = vi.fn(async () => ({ files: [file], limit: 50 }));
  const handler = createOwnerFileCatalogHttpHandler({
    authentication,
    listOwnerFiles,
  });

  return { authentication, handler, listOwnerFiles };
}

describe("owner file catalog HTTP handler", () => {
  it("returns only owner-safe metadata for an authenticated request", async () => {
    const harness = createHarness();

    const response = await harness.handler.list(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      limit: 50,
      files: [
        {
          ...file,
          expiresAt: "2026-09-02T08:00:00.000Z",
          lastDownloadedAt: "2026-09-01T09:00:00.000Z",
          createdAt: "2026-09-01T07:59:00.000Z",
        },
      ],
    });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("vary")).toBe("Cookie");
    expect(harness.listOwnerFiles).toHaveBeenCalledOnce();
  });

  it("rejects a missing session before querying metadata", async () => {
    const harness = createHarness();

    const response = await harness.handler.list(request(""));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: { code: "UNAUTHENTICATED" },
    });
    expect(harness.listOwnerFiles).not.toHaveBeenCalled();
  });

  it("does not expose authentication or database failures", async () => {
    const harness = createHarness();
    harness.listOwnerFiles.mockRejectedValueOnce(
      new Error("postgresql://private-credential"),
    );

    const response = await harness.handler.list(request());

    expect(response.status).toBe(503);
    const body = await response.text();
    expect(body).toContain("FILES_UNAVAILABLE");
    expect(body).not.toContain("private-credential");
  });
});
