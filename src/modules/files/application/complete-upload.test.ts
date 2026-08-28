import { describe, expect, it, vi } from "vitest";

import type { FileRecord, FileStatus } from "../domain/file-record";
import { createCompleteUpload, UploadCompletionError } from "./complete-upload";
import type { FileRepository } from "./ports/file-repository";
import type { ObjectStore } from "./ports/object-store";

const now = new Date("2026-08-28T08:00:00.000Z");
const fileId = "123e4567-e89b-42d3-a456-426614174001";
const objectKey = "objects/123e4567-e89b-42d3-a456-426614174000";

function createFile(status: FileStatus = "PENDING"): FileRecord {
  return {
    id: fileId,
    shareTokenHash: "a".repeat(64),
    objectKey,
    originalName: "architecture.pdf",
    contentType: "application/pdf",
    sizeBytes: 42,
    status,
    expiresAt: new Date("2026-08-29T08:00:00.000Z"),
    uploadedAt: status === "READY" ? now : null,
    downloadCount: 0,
    lastDownloadedAt: null,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

function createHarness(initialFile: FileRecord | null = createFile()) {
  let currentFile = initialFile;
  const transition = (status: FileStatus, uploadedAt: Date | null = null) => {
    if (!currentFile || currentFile.status !== "PENDING") {
      return null;
    }

    currentFile = { ...currentFile, status, uploadedAt };
    return currentFile;
  };
  const fileRepository: FileRepository = {
    create: vi.fn(async () => {
      throw new Error("not used");
    }),
    findById: vi.fn(async () => currentFile),
    findByShareTokenHash: vi.fn(async () => null),
    markExpiredIfPending: vi.fn(async () => transition("EXPIRED")),
    markFailedIfPending: vi.fn(async () => transition("FAILED")),
    markReadyIfPending: vi.fn(async (_id, uploadedAt) =>
      transition("READY", uploadedAt),
    ),
  };
  const objectStore: ObjectStore = {
    inspectObject: vi.fn(async () => ({
      contentType: "application/pdf",
      sizeBytes: 42,
    })),
    deleteObject: vi.fn(async () => undefined),
  };
  const completeUpload = createCompleteUpload({
    fileRepository,
    objectStore,
    clock: () => now,
  });

  return { completeUpload, fileRepository, objectStore };
}

describe("completeUpload", () => {
  it("marks an upload ready only after R2 metadata matches", async () => {
    const harness = createHarness();

    await expect(harness.completeUpload(fileId)).resolves.toEqual({
      fileId,
      status: "READY",
      uploadedAt: now,
      expiresAt: new Date("2026-08-29T08:00:00.000Z"),
    });
    expect(harness.objectStore.inspectObject).toHaveBeenCalledWith(objectKey);
    expect(harness.fileRepository.markReadyIfPending).toHaveBeenCalledWith(
      fileId,
      now,
    );
    expect(harness.objectStore.deleteObject).not.toHaveBeenCalled();
  });

  it("is idempotent after an upload is already ready", async () => {
    const harness = createHarness(createFile("READY"));

    await expect(harness.completeUpload(fileId)).resolves.toMatchObject({
      fileId,
      status: "READY",
    });
    expect(harness.objectStore.inspectObject).not.toHaveBeenCalled();
    expect(harness.fileRepository.markReadyIfPending).not.toHaveBeenCalled();
  });

  it("keeps a pending record retriable when the object is not visible yet", async () => {
    const harness = createHarness();
    vi.mocked(harness.objectStore.inspectObject).mockResolvedValueOnce(null);

    await expect(harness.completeUpload(fileId)).rejects.toMatchObject({
      code: "OBJECT_NOT_FOUND",
    });
    expect(harness.fileRepository.markFailedIfPending).not.toHaveBeenCalled();
    expect(harness.objectStore.deleteObject).not.toHaveBeenCalled();
  });

  it.each([
    { contentType: "application/pdf", sizeBytes: 41 },
    { contentType: "text/plain", sizeBytes: 42 },
  ])(
    "rejects and removes an object whose metadata differs",
    async (metadata) => {
      const harness = createHarness();
      vi.mocked(harness.objectStore.inspectObject).mockResolvedValueOnce(
        metadata,
      );

      await expect(harness.completeUpload(fileId)).rejects.toMatchObject({
        code: "OBJECT_MISMATCH",
        cleanupPending: false,
      });
      expect(harness.fileRepository.markFailedIfPending).toHaveBeenCalledWith(
        fileId,
      );
      expect(harness.objectStore.deleteObject).toHaveBeenCalledWith(objectKey);
    },
  );

  it("reports that cleanup is pending when rejected-object deletion fails", async () => {
    const harness = createHarness();
    vi.mocked(harness.objectStore.inspectObject).mockResolvedValueOnce({
      contentType: "application/pdf",
      sizeBytes: 41,
    });
    vi.mocked(harness.objectStore.deleteObject).mockRejectedValueOnce(
      new Error("storage unavailable"),
    );

    await expect(harness.completeUpload(fileId)).rejects.toEqual(
      expect.objectContaining<Partial<UploadCompletionError>>({
        code: "OBJECT_MISMATCH",
        cleanupPending: true,
      }),
    );
  });

  it("expires a pending upload before inspecting its object", async () => {
    const file = createFile();
    file.expiresAt = new Date(now.getTime() - 1);
    const harness = createHarness(file);

    await expect(harness.completeUpload(fileId)).rejects.toMatchObject({
      code: "UPLOAD_EXPIRED",
    });
    expect(harness.fileRepository.markExpiredIfPending).toHaveBeenCalledWith(
      fileId,
    );
    expect(harness.objectStore.inspectObject).not.toHaveBeenCalled();
    expect(harness.objectStore.deleteObject).toHaveBeenCalledWith(objectKey);
  });

  it.each([
    { file: null, code: "UPLOAD_NOT_FOUND" },
    { file: createFile("FAILED"), code: "UPLOAD_NOT_COMPLETABLE" },
  ])("rejects a missing or terminal upload", async ({ file, code }) => {
    const harness = createHarness(file);

    await expect(harness.completeUpload(fileId)).rejects.toMatchObject({
      code,
    });
    expect(harness.objectStore.inspectObject).not.toHaveBeenCalled();
  });
});
