import { describe, expect, it, vi } from "vitest";

import type { FileRecord, FileStatus } from "../domain/file-record";
import { hashShareToken } from "../domain/share-token";
import {
  createResolveDownload,
  DownloadResolutionError,
} from "./resolve-download";
import type { DownloadUrlProvider } from "./ports/download-url-provider";
import type { FileRepository } from "./ports/file-repository";

const now = new Date("2026-08-30T08:00:00.000Z");
const shareToken = Buffer.alloc(32, 7).toString("base64url");
const objectKey = "objects/123e4567-e89b-42d3-a456-426614174000";

function createFile(status: FileStatus = "READY"): FileRecord {
  return {
    id: "123e4567-e89b-42d3-a456-426614174001",
    shareTokenHash: hashShareToken(shareToken),
    objectKey,
    originalName: "architecture.pdf",
    contentType: "application/pdf",
    sizeBytes: 42,
    status,
    expiresAt: new Date(now.getTime() + 86_400_000),
    uploadedAt: now,
    downloadCount: 0,
    lastDownloadedAt: null,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

function createHarness(file: FileRecord | null = createFile()) {
  const fileRepository: FileRepository = {
    create: vi.fn(async () => {
      throw new Error("not used");
    }),
    findById: vi.fn(async () => null),
    findByShareTokenHash: vi.fn(async () => file),
    markExpiredIfPending: vi.fn(async () => null),
    markFailedIfPending: vi.fn(async () => null),
    markReadyIfPending: vi.fn(async () => null),
  };
  const downloadUrlProvider: DownloadUrlProvider = {
    createDownloadUrl: vi.fn(async (input) => ({
      url: "https://storage.example.test/download?signature=redacted",
      expiresAt: new Date(now.getTime() + input.expiresInSeconds * 1_000),
    })),
  };
  const resolveDownload = createResolveDownload({
    fileRepository,
    downloadUrlProvider,
    clock: () => now,
  });

  return { downloadUrlProvider, fileRepository, resolveDownload };
}

describe("resolveDownload", () => {
  it("resolves a ready unexpired file through its hashed token", async () => {
    const harness = createHarness();

    await expect(harness.resolveDownload(shareToken)).resolves.toEqual({
      url: "https://storage.example.test/download?signature=redacted",
      expiresAt: new Date("2026-08-30T08:05:00.000Z"),
    });
    expect(harness.fileRepository.findByShareTokenHash).toHaveBeenCalledWith(
      hashShareToken(shareToken),
    );
    expect(harness.downloadUrlProvider.createDownloadUrl).toHaveBeenCalledWith({
      objectKey,
      originalName: "architecture.pdf",
      expiresInSeconds: 300,
    });
  });

  it("does not query PostgreSQL for a malformed token", async () => {
    const harness = createHarness();

    await expect(harness.resolveDownload("not-a-token")).rejects.toMatchObject({
      code: "DOWNLOAD_NOT_FOUND",
    });
    expect(harness.fileRepository.findByShareTokenHash).not.toHaveBeenCalled();
    expect(
      harness.downloadUrlProvider.createDownloadUrl,
    ).not.toHaveBeenCalled();
  });

  it.each([null, createFile("PENDING"), createFile("FAILED")])(
    "does not authorize a missing or non-ready record",
    async (file) => {
      const harness = createHarness(file);

      await expect(harness.resolveDownload(shareToken)).rejects.toMatchObject({
        code: "DOWNLOAD_NOT_FOUND",
      });
      expect(
        harness.downloadUrlProvider.createDownloadUrl,
      ).not.toHaveBeenCalled();
    },
  );

  it("denies an expired file before contacting object storage", async () => {
    const file = createFile();
    file.expiresAt = new Date(now.getTime() + 1_999);
    const harness = createHarness(file);

    await expect(harness.resolveDownload(shareToken)).rejects.toMatchObject({
      code: "DOWNLOAD_EXPIRED",
    });
    expect(
      harness.downloadUrlProvider.createDownloadUrl,
    ).not.toHaveBeenCalled();
  });

  it("shortens authorization so it cannot outlive the file", async () => {
    const file = createFile();
    file.expiresAt = new Date(now.getTime() + 120_500);
    const harness = createHarness(file);

    await harness.resolveDownload(shareToken);

    expect(harness.downloadUrlProvider.createDownloadUrl).toHaveBeenCalledWith(
      expect.objectContaining({ expiresInSeconds: 119 }),
    );
  });

  it.each([
    {
      url: "http://storage.example.test/download",
      expiresAt: new Date(now.getTime() + 300_000),
    },
    {
      url: "https://user:password@storage.example.test/download",
      expiresAt: new Date(now.getTime() + 300_000),
    },
    {
      url: "https://storage.example.test/download",
      expiresAt: new Date(now.getTime() + 301_000),
    },
  ])("rejects an unsafe provider authorization", async (authorization) => {
    const harness = createHarness();
    vi.mocked(
      harness.downloadUrlProvider.createDownloadUrl,
    ).mockResolvedValueOnce(authorization);

    await expect(harness.resolveDownload(shareToken)).rejects.toEqual(
      expect.objectContaining<Partial<DownloadResolutionError>>({
        code: "INVALID_DOWNLOAD_AUTHORIZATION",
      }),
    );
  });
});
