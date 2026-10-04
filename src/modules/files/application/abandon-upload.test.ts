import { describe, expect, it, vi } from "vitest";

import { ABANDONED_UPLOAD_MILLISECONDS } from "../domain/file-policy";
import type { FileRecord, FileStatus } from "../domain/file-record";
import { createAbandonUpload, UploadAbandonmentError } from "./abandon-upload";
import { createCompleteUpload } from "./complete-upload";
import type { FileRepository } from "./ports/file-repository";
import type { ObjectStore } from "./ports/object-store";

const fileId = "123e4567-e89b-42d3-a456-426614174001";
const now = new Date("2026-10-04T08:00:00.000Z");
const sixHoursAgo = new Date(now.getTime() - ABANDONED_UPLOAD_MILLISECONDS);

function createFile(overrides: Partial<FileRecord> = {}): FileRecord {
  return {
    id: fileId,
    shareTokenHash: "a".repeat(64),
    objectKey: `objects/${fileId}`,
    originalName: "video.mp4",
    contentType: "video/mp4",
    sizeBytes: 42,
    status: "PENDING",
    expiresAt: new Date(now.getTime() + 86_400_000),
    uploadedAt: null,
    downloadCount: 0,
    lastDownloadedAt: null,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function createHarness(
  initial: FileRecord | null,
  stored: { sizeBytes: number; contentType: string } | null,
) {
  let file = initial;
  const transition = (status: FileStatus, uploadedAt?: Date) => {
    if (file?.status !== "PENDING") return null;
    file = { ...file, status, uploadedAt: uploadedAt ?? file.uploadedAt };
    return { ...file };
  };
  const fileRepository = {
    create: vi.fn(),
    findByShareTokenHash: vi.fn(),
    findById: vi.fn(async () => (file ? { ...file } : null)),
    markExpiredIfPending: vi.fn(async () => transition("EXPIRED")),
    markFailedIfPending: vi.fn(async () => transition("FAILED")),
    markReadyIfPending: vi.fn(async (_id: string, uploadedAt: Date) =>
      transition("READY", uploadedAt),
    ),
  } satisfies FileRepository;
  const objectStore: ObjectStore = {
    deleteObject: vi.fn(async () => undefined),
    inspectObject: vi.fn(async () => stored),
  };
  const abandonUpload = createAbandonUpload({
    completeUpload: createCompleteUpload({
      fileRepository,
      objectStore,
      clock: () => now,
    }),
    fileRepository,
    clock: () => now,
  });

  return { abandonUpload, fileRepository, objectStore };
}

describe("abandonUpload", () => {
  it("leaves a recent upload pending while its object could still arrive", async () => {
    const harness = createHarness(
      createFile({ createdAt: new Date(sixHoursAgo.getTime() + 1) }),
      null,
    );

    await expect(harness.abandonUpload(fileId)).resolves.toEqual({
      fileId,
      status: "PENDING",
    });
    expect(harness.fileRepository.markFailedIfPending).not.toHaveBeenCalled();
  });

  it("fails a six-hour-old upload whose object never reached storage", async () => {
    const harness = createHarness(createFile({ createdAt: sixHoursAgo }), null);

    await expect(harness.abandonUpload(fileId)).resolves.toEqual({
      fileId,
      status: "FAILED",
    });
    expect(harness.objectStore.deleteObject).not.toHaveBeenCalled();
  });

  it("completes an upload whose PUT succeeded although the browser saw a failure", async () => {
    const harness = createHarness(createFile(), {
      sizeBytes: 42,
      contentType: "video/mp4",
    });

    await expect(harness.abandonUpload(fileId)).resolves.toEqual({
      fileId,
      status: "READY",
    });
    expect(harness.fileRepository.markFailedIfPending).not.toHaveBeenCalled();
  });

  it("fails and discards a mismatched object through completion", async () => {
    const harness = createHarness(createFile(), {
      sizeBytes: 41,
      contentType: "video/mp4",
    });

    await expect(harness.abandonUpload(fileId)).resolves.toEqual({
      fileId,
      status: "FAILED",
    });
    expect(harness.objectStore.deleteObject).toHaveBeenCalledWith(
      `objects/${fileId}`,
    );
  });

  it("records a due upload as expired rather than failed", async () => {
    const harness = createHarness(createFile({ expiresAt: now }), null);

    await expect(harness.abandonUpload(fileId)).resolves.toEqual({
      fileId,
      status: "EXPIRED",
    });
  });

  it.each(["READY", "EXPIRED", "FAILED", "DELETING", "DELETED"] as const)(
    "leaves a %s record unchanged",
    async (status) => {
      const harness = createHarness(createFile({ status }), null);

      await expect(harness.abandonUpload(fileId)).resolves.toEqual({
        fileId,
        status,
      });
      expect(harness.fileRepository.markFailedIfPending).not.toHaveBeenCalled();
    },
  );

  it("judges age before inspecting storage, not after", async () => {
    const createdAt = new Date(
      now.getTime() - ABANDONED_UPLOAD_MILLISECONDS + 1,
    );
    const harness = createHarness(createFile({ createdAt }), null);
    const clock = vi
      .fn<() => Date>()
      .mockReturnValueOnce(now)
      .mockReturnValue(new Date(now.getTime() + 60_000));
    const abandonUpload = createAbandonUpload({
      completeUpload: createCompleteUpload({
        fileRepository: harness.fileRepository,
        objectStore: harness.objectStore,
        clock,
      }),
      fileRepository: harness.fileRepository,
      clock,
    });

    await expect(abandonUpload(fileId)).resolves.toEqual({
      fileId,
      status: "PENDING",
    });
    expect(harness.fileRepository.markFailedIfPending).not.toHaveBeenCalled();
  });

  it("does not fail an upload that a concurrent completion made ready", async () => {
    const harness = createHarness(createFile({ createdAt: sixHoursAgo }), null);
    harness.fileRepository.markFailedIfPending.mockImplementationOnce(
      async () => {
        await harness.fileRepository.markReadyIfPending(fileId, now);
        return null;
      },
    );

    await expect(harness.abandonUpload(fileId)).resolves.toEqual({
      fileId,
      status: "READY",
    });
  });

  it("leaves the row pending when storage cannot be inspected", async () => {
    const harness = createHarness(createFile(), null);
    vi.mocked(harness.objectStore.inspectObject).mockRejectedValueOnce(
      new Error("storage unavailable"),
    );

    await expect(harness.abandonUpload(fileId)).rejects.toThrow(
      "storage unavailable",
    );
    expect(harness.fileRepository.markFailedIfPending).not.toHaveBeenCalled();
  });

  it("reports an unknown upload", async () => {
    const harness = createHarness(null, null);

    await expect(harness.abandonUpload(fileId)).rejects.toEqual(
      new UploadAbandonmentError("UPLOAD_NOT_FOUND"),
    );
  });
});
