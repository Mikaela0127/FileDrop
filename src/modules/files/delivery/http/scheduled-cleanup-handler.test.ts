import { describe, expect, it, vi } from "vitest";

import type { CleanupExpiredFilesResult } from "../../application/cleanup-expired-files";
import { createScheduledCleanupHandler } from "./scheduled-cleanup-handler";

const cronSecret = "c".repeat(32);
const successfulResult: CleanupExpiredFilesResult = {
  expiredCount: 2,
  examinedCount: 2,
  claimedCount: 2,
  deletedCount: 2,
  failedCount: 0,
  skippedCount: 0,
};

function createRequest(authorization?: string): Request {
  return new Request("https://filedrop.example/api/cron/cleanup", {
    headers: authorization ? { authorization } : undefined,
  });
}

describe("scheduled cleanup HTTP handler", () => {
  it("runs cleanup for the configured bearer secret", async () => {
    const cleanupExpiredFiles = vi.fn(async () => successfulResult);
    const handler = createScheduledCleanupHandler({
      cleanupExpiredFiles,
      cronSecret,
    });

    const response = await handler(createRequest(`Bearer ${cronSecret}`));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      ...successfulResult,
    });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(cleanupExpiredFiles).toHaveBeenCalledOnce();
  });

  it.each([undefined, "Bearer wrong-secret", `Basic ${cronSecret}`])(
    "rejects an invalid authorization header without running cleanup",
    async (authorization) => {
      const cleanupExpiredFiles = vi.fn(async () => successfulResult);
      const handler = createScheduledCleanupHandler({
        cleanupExpiredFiles,
        cronSecret,
      });

      const response = await handler(createRequest(authorization));

      expect(response.status).toBe(401);
      expect(response.headers.get("www-authenticate")).toBe("Bearer");
      await expect(response.json()).resolves.toEqual({
        error: { code: "UNAUTHORIZED" },
      });
      expect(cleanupExpiredFiles).not.toHaveBeenCalled();
    },
  );

  it("reports partial provider failure as retriable", async () => {
    const cleanupExpiredFiles = vi.fn(async () => ({
      ...successfulResult,
      deletedCount: 1,
      failedCount: 1,
    }));
    const handler = createScheduledCleanupHandler({
      cleanupExpiredFiles,
      cronSecret,
    });

    const response = await handler(createRequest(`Bearer ${cronSecret}`));

    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("300");
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      failedCount: 1,
    });
  });

  it("returns a generic response when cleanup cannot start", async () => {
    const handler = createScheduledCleanupHandler({
      cleanupExpiredFiles: vi.fn(async () => {
        throw new Error("database unavailable");
      }),
      cronSecret,
    });

    const response = await handler(createRequest(`Bearer ${cronSecret}`));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: { code: "CLEANUP_UNAVAILABLE" },
    });
  });
});
