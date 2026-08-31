import { describe, expect, it, vi } from "vitest";

import type { OwnerFileCatalogRepository } from "./ports/owner-file-catalog-repository";
import {
  createListOwnerFiles,
  OWNER_FILE_CATALOG_LIMIT,
} from "./list-owner-files";

describe("listOwnerFiles", () => {
  it("returns a bounded recent catalog from the narrow repository port", async () => {
    const files = [
      {
        id: "123e4567-e89b-42d3-a456-426614174001",
        originalName: "architecture.pdf",
        contentType: "application/pdf",
        sizeBytes: 42,
        status: "READY" as const,
        expiresAt: new Date("2026-09-02T08:00:00.000Z"),
        downloadCount: 3,
        lastDownloadedAt: new Date("2026-09-01T09:00:00.000Z"),
        createdAt: new Date("2026-09-01T07:59:00.000Z"),
      },
    ];
    const fileCatalogRepository: OwnerFileCatalogRepository = {
      listRecent: vi.fn(async () => files),
    };
    const listOwnerFiles = createListOwnerFiles({ fileCatalogRepository });

    await expect(listOwnerFiles()).resolves.toEqual({
      files,
      limit: OWNER_FILE_CATALOG_LIMIT,
    });
    expect(fileCatalogRepository.listRecent).toHaveBeenCalledExactlyOnceWith(
      OWNER_FILE_CATALOG_LIMIT,
    );
  });
});
