import { describe, expect, it, vi } from "vitest";

import type { FileRecord, FileStatus } from "../domain/file-record";
import {
  createCleanupExpiredFiles,
  DELETION_LEASE_MILLISECONDS,
} from "./cleanup-expired-files";
import type { FileCleanupRepository } from "./ports/file-cleanup-repository";
import type { ObjectStore } from "./ports/object-store";

const now = new Date("2026-08-30T08:00:00.000Z");

function createFile(id: string, status: FileStatus = "EXPIRED"): FileRecord {
  return {
    id,
    shareTokenHash: "a".repeat(64),
    objectKey: `objects/${id}`,
    originalName: "architecture.pdf",
    contentType: "application/pdf",
    sizeBytes: 42,
    status,
    expiresAt: new Date("2026-08-30T07:00:00.000Z"),
    uploadedAt: null,
    downloadCount: 0,
    lastDownloadedAt: null,
    deletedAt: null,
    createdAt: new Date("2026-08-29T08:00:00.000Z"),
    updatedAt: now,
  };
}

function createHarness(candidateFiles: FileRecord[] = []) {
  const files = new Map(candidateFiles.map((file) => [file.id, file]));
  const fileCleanupRepository: FileCleanupRepository = {
    expireDueFiles: vi.fn(async () => 2),
    findDeletionCandidateIds: vi.fn(async () => [...files.keys()]),
    claimForDeletion: vi.fn(
      async (
        id: string,
        _staleLeaseBefore: Date,
        leaseAcquiredAt: Date,
      ): Promise<FileRecord | null> => {
        const file = files.get(id);
        return file
          ? { ...file, status: "DELETING", updatedAt: leaseAcquiredAt }
          : null;
      },
    ),
    markDeleted: vi.fn(async () => true),
    releaseDeletion: vi.fn(async () => true),
  };
  const objectStore: ObjectStore = {
    deleteObject: vi.fn(async () => undefined),
    inspectObject: vi.fn(async () => null),
  };
  const cleanupExpiredFiles = createCleanupExpiredFiles({
    fileCleanupRepository,
    objectStore,
    clock: () => now,
    batchSize: 10,
  });

  return { cleanupExpiredFiles, fileCleanupRepository, objectStore };
}

describe("cleanupExpiredFiles", () => {
  it("expires due metadata, claims candidates, and deletes their objects", async () => {
    const files = [createFile("file-1"), createFile("file-2", "FAILED")];
    const harness = createHarness(files);

    await expect(harness.cleanupExpiredFiles()).resolves.toEqual({
      expiredCount: 2,
      examinedCount: 2,
      claimedCount: 2,
      deletedCount: 2,
      failedCount: 0,
      skippedCount: 0,
    });
    expect(harness.fileCleanupRepository.expireDueFiles).toHaveBeenCalledWith(
      now,
      10,
    );
    expect(
      harness.fileCleanupRepository.findDeletionCandidateIds,
    ).toHaveBeenCalledWith(
      new Date(now.getTime() - DELETION_LEASE_MILLISECONDS),
      10,
    );
    expect(harness.objectStore.deleteObject).toHaveBeenNthCalledWith(
      1,
      files[0].objectKey,
    );
    expect(harness.objectStore.deleteObject).toHaveBeenNthCalledWith(
      2,
      files[1].objectKey,
    );
    expect(harness.fileCleanupRepository.markDeleted).toHaveBeenCalledTimes(2);
  });

  it("releases a claimed record for retry when object deletion fails", async () => {
    const file = createFile("file-1");
    const harness = createHarness([file]);
    vi.mocked(harness.objectStore.deleteObject).mockRejectedValueOnce(
      new Error("storage unavailable"),
    );

    await expect(harness.cleanupExpiredFiles()).resolves.toMatchObject({
      claimedCount: 1,
      deletedCount: 0,
      failedCount: 1,
    });
    expect(harness.fileCleanupRepository.releaseDeletion).toHaveBeenCalledWith(
      file.id,
      now,
    );
    expect(harness.fileCleanupRepository.markDeleted).not.toHaveBeenCalled();
  });

  it("leaves a failed release recoverable through the stale lease", async () => {
    const harness = createHarness([createFile("file-1")]);
    vi.mocked(harness.objectStore.deleteObject).mockRejectedValueOnce(
      new Error("storage unavailable"),
    );
    vi.mocked(
      harness.fileCleanupRepository.releaseDeletion,
    ).mockRejectedValueOnce(new Error("database unavailable"));

    await expect(harness.cleanupExpiredFiles()).resolves.toMatchObject({
      failedCount: 1,
    });
  });

  it("skips a candidate claimed by another cleanup invocation", async () => {
    const harness = createHarness([createFile("file-1")]);
    vi.mocked(
      harness.fileCleanupRepository.claimForDeletion,
    ).mockResolvedValueOnce(null);

    await expect(harness.cleanupExpiredFiles()).resolves.toMatchObject({
      examinedCount: 1,
      claimedCount: 0,
      skippedCount: 1,
    });
    expect(harness.objectStore.deleteObject).not.toHaveBeenCalled();
  });

  it("does not finalize a deletion after its lease is lost", async () => {
    const harness = createHarness([createFile("file-1")]);
    vi.mocked(harness.fileCleanupRepository.markDeleted).mockResolvedValueOnce(
      false,
    );

    await expect(harness.cleanupExpiredFiles()).resolves.toMatchObject({
      claimedCount: 1,
      deletedCount: 0,
      failedCount: 0,
      skippedCount: 1,
    });
    expect(
      harness.fileCleanupRepository.releaseDeletion,
    ).not.toHaveBeenCalled();
  });

  it("rejects invalid execution settings before accessing dependencies", () => {
    const harness = createHarness();

    expect(() =>
      createCleanupExpiredFiles({
        fileCleanupRepository: harness.fileCleanupRepository,
        objectStore: harness.objectStore,
        batchSize: 0,
      }),
    ).toThrow("batchSize must be a positive safe integer");
  });
});
