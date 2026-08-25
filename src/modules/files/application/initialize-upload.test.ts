import { describe, expect, it, vi } from "vitest";

import type {
  CreateFileRecordInput,
  FileRepository,
} from "./ports/file-repository";
import type {
  CreateUploadUrlInput,
  UploadUrlProvider,
} from "./ports/upload-url-provider";
import {
  createInitializeUpload,
  UploadInitializationError,
} from "./initialize-upload";
import type { FileRecord } from "../domain/file-record";
import { hashShareToken } from "../domain/share-token";

const now = new Date("2026-08-24T08:00:00.000Z");
const rawShareToken = "a".repeat(43);
const objectKey = "objects/123e4567-e89b-42d3-a456-426614174000";

function createFileRecord(input: CreateFileRecordInput): FileRecord {
  return {
    id: "123e4567-e89b-42d3-a456-426614174001",
    ...input,
    status: input.status ?? "PENDING",
    uploadedAt: input.uploadedAt ?? null,
    downloadCount: 0,
    lastDownloadedAt: null,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

function createHarness(clock: () => Date = () => now) {
  const persistedInputs: CreateFileRecordInput[] = [];
  const uploadInputs: CreateUploadUrlInput[] = [];
  const fileRepository: FileRepository = {
    create: vi.fn(async (input) => {
      persistedInputs.push(input);
      return createFileRecord(input);
    }),
    findByShareTokenHash: vi.fn(async () => null),
  };
  const uploadUrlProvider: UploadUrlProvider = {
    createUploadUrl: vi.fn(async (input: CreateUploadUrlInput) => {
      uploadInputs.push(input);
      return {
        url: "https://storage.example.test/upload?signature=redacted",
        method: "PUT" as const,
        headers: { "content-type": input.contentType },
        expiresAt: new Date(now.getTime() + 15 * 60 * 1_000),
      };
    }),
  };
  const initializeUpload = createInitializeUpload({
    fileRepository,
    uploadUrlProvider,
    clock,
    createObjectKey: () => objectKey,
    createShareToken: () => rawShareToken,
  });

  return {
    fileRepository,
    uploadUrlProvider,
    persistedInputs,
    uploadInputs,
    initializeUpload,
  };
}

describe("initializeUpload", () => {
  it("creates a short-lived upload authorization and persists only a token hash", async () => {
    const harness = createHarness();

    const result = await harness.initializeUpload({
      originalName: " private-plan.pdf ",
      contentType: "application/pdf",
      sizeBytes: 42,
      expirationSeconds: 86_400,
    });

    expect(harness.uploadInputs).toEqual([
      {
        objectKey,
        contentType: "application/pdf",
        sizeBytes: 42,
        expiresInSeconds: 900,
      },
    ]);
    expect(harness.persistedInputs).toEqual([
      {
        shareTokenHash: hashShareToken(rawShareToken),
        objectKey,
        originalName: "private-plan.pdf",
        contentType: "application/pdf",
        sizeBytes: 42,
        status: "PENDING",
        expiresAt: new Date("2026-08-25T08:00:00.000Z"),
      },
    ]);
    expect(JSON.stringify(harness.persistedInputs)).not.toContain(
      rawShareToken,
    );
    expect(objectKey).not.toContain("private-plan.pdf");
    expect(result).toMatchObject({
      fileId: "123e4567-e89b-42d3-a456-426614174001",
      shareToken: rawShareToken,
      fileExpiresAt: new Date("2026-08-25T08:00:00.000Z"),
      upload: { method: "PUT" },
    });
  });

  it("validates URL expiry against the time at which signing finishes", async () => {
    const signingFinishedAt = new Date(now.getTime() + 250);
    const clockValues = [now, signingFinishedAt];
    const harness = createHarness(
      () => clockValues.shift() ?? signingFinishedAt,
    );
    vi.mocked(harness.uploadUrlProvider.createUploadUrl).mockResolvedValueOnce({
      url: "https://storage.example.test/upload?signature=redacted",
      method: "PUT",
      headers: { "content-type": "application/pdf" },
      expiresAt: new Date(signingFinishedAt.getTime() + 15 * 60 * 1_000),
    });

    await expect(
      harness.initializeUpload({
        originalName: "private-plan.pdf",
        contentType: "application/pdf",
        sizeBytes: 42,
        expirationSeconds: 86_400,
      }),
    ).resolves.toMatchObject({ upload: { method: "PUT" } });
  });

  it("does not contact infrastructure when metadata is invalid", async () => {
    const harness = createHarness();

    await expect(
      harness.initializeUpload({
        originalName: "../private-plan.pdf",
        contentType: "application/pdf",
        sizeBytes: 42,
        expirationSeconds: 86_400,
      }),
    ).rejects.toThrow();

    expect(harness.uploadUrlProvider.createUploadUrl).not.toHaveBeenCalled();
    expect(harness.fileRepository.create).not.toHaveBeenCalled();
  });

  it.each([
    "http://storage.example.test/upload",
    "https://user:password@storage.example.test/upload",
  ])("rejects an unsafe upload URL %s", async (url) => {
    const harness = createHarness();
    vi.mocked(harness.uploadUrlProvider.createUploadUrl).mockResolvedValueOnce({
      url,
      method: "PUT",
      headers: {},
      expiresAt: new Date(now.getTime() + 15 * 60 * 1_000),
    });

    await expect(
      harness.initializeUpload({
        originalName: "private-plan.pdf",
        contentType: "application/pdf",
        sizeBytes: 42,
        expirationSeconds: 86_400,
      }),
    ).rejects.toThrowError(
      expect.objectContaining<Partial<UploadInitializationError>>({
        code: "INVALID_UPLOAD_AUTHORIZATION",
      }),
    );

    expect(harness.fileRepository.create).not.toHaveBeenCalled();
  });

  it.each([
    new Date("invalid"),
    new Date(now.getTime() - 1),
    new Date(now.getTime() + 901_000),
  ])("rejects unsafe upload authorization expiry %s", async (expiresAt) => {
    const harness = createHarness();
    vi.mocked(harness.uploadUrlProvider.createUploadUrl).mockResolvedValueOnce({
      url: "https://storage.example.test/upload",
      method: "PUT",
      headers: {},
      expiresAt,
    });

    await expect(
      harness.initializeUpload({
        originalName: "private-plan.pdf",
        contentType: "application/pdf",
        sizeBytes: 42,
        expirationSeconds: 86_400,
      }),
    ).rejects.toThrowError(
      expect.objectContaining<Partial<UploadInitializationError>>({
        code: "INVALID_UPLOAD_AUTHORIZATION",
      }),
    );

    expect(harness.fileRepository.create).not.toHaveBeenCalled();
  });

  it("does not persist metadata when URL creation fails", async () => {
    const harness = createHarness();
    vi.mocked(harness.uploadUrlProvider.createUploadUrl).mockRejectedValueOnce(
      new Error("storage unavailable"),
    );

    await expect(
      harness.initializeUpload({
        originalName: "private-plan.pdf",
        contentType: "application/pdf",
        sizeBytes: 42,
        expirationSeconds: 86_400,
      }),
    ).rejects.toThrow("storage unavailable");

    expect(harness.fileRepository.create).not.toHaveBeenCalled();
  });
});
