import { describe, expect, it, vi } from "vitest";

import { DownloadResolutionError } from "../../application/resolve-download";
import { createPublicDownloadHandler } from "./public-download-handler";

const shareToken = Buffer.alloc(32, 7).toString("base64url");

function createHarness() {
  const resolveDownload = vi.fn(async () => ({
    url: "https://storage.example.test/download?signature=redacted",
    expiresAt: new Date("2026-08-30T08:05:00.000Z"),
  }));
  const handler = createPublicDownloadHandler(resolveDownload);

  return { handler, resolveDownload };
}

describe("public download HTTP handler", () => {
  it("redirects to a short-lived storage URL without caching or referrer leakage", async () => {
    const harness = createHarness();

    const response = await harness.handler(shareToken);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://storage.example.test/download?signature=redacted",
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(harness.resolveDownload).toHaveBeenCalledWith(shareToken);
  });

  it.each([
    ["DOWNLOAD_NOT_FOUND", 404, "invalid or unavailable"],
    ["DOWNLOAD_EXPIRED", 410, "expired"],
  ] as const)("maps %s to a safe response", async (code, status, message) => {
    const harness = createHarness();
    harness.resolveDownload.mockRejectedValueOnce(
      new DownloadResolutionError(code),
    );

    const response = await harness.handler(shareToken);

    expect(response.status).toBe(status);
    expect(await response.text()).toContain(message);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("does not expose infrastructure errors", async () => {
    const harness = createHarness();
    harness.resolveDownload.mockRejectedValueOnce(
      new Error("secret provider detail"),
    );

    const response = await harness.handler(shareToken);
    const body = await response.text();

    expect(response.status).toBe(503);
    expect(body).not.toContain("secret provider detail");
  });
});
