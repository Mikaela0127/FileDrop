import { describe, expect, it, vi } from "vitest";
import {
  createManageOwnerFile,
  UPLOAD_DELETION_SAFETY_MS,
} from "./manage-owner-file";
import type { FileRecord } from "../domain/file-record";
import type { FileManagementRepository } from "./ports/file-management-repository";
import { generateShareToken, hashShareToken } from "../domain/share-token";
import { AesShareTokenCipher } from "../infrastructure/storage/aes-share-token-cipher";

const now = new Date("2026-09-05T12:00:00Z");
function setup(overrides: Partial<FileRecord> = {}) {
  const token = generateShareToken();
  const cipher = new AesShareTokenCipher({
    active: "test",
    keys: { test: Buffer.alloc(32, 1).toString("hex") },
  });
  let file: FileRecord | null = {
    id: "123e4567-e89b-42d3-a456-426614174001",
    objectKey: "objects/test",
    originalName: "private.txt",
    contentType: "text/plain",
    sizeBytes: 12,
    shareTokenHash: hashShareToken(token),
    shareTokenCiphertext: cipher.encrypt(token, "objects/test"),
    status: "READY",
    expiresAt: new Date(now.getTime() + 3600_000),
    createdAt: new Date(now.getTime() - 3600_000),
    updatedAt: now,
    uploadedAt: now,
    deletedAt: null,
    lastDownloadedAt: null,
    downloadCount: 0,
    ...overrides,
  };
  const repository = {
    findById: vi.fn(async () => file),
    expireReadyFile: vi.fn(async () => {
      if (!file || file.status !== "READY") return false;
      file.status = "EXPIRED";
      file.manuallyExpiredAt = now;
      return true;
    }),
    expireDueFile: vi.fn(async () => {}),
    storeLegacyShareToken: vi.fn(async (_id, _old, hash, ciphertext) => {
      if (!file) return false;
      file.shareTokenHash = hash;
      file.shareTokenCiphertext = ciphertext;
      return true;
    }),
    claimForDeletion: vi.fn(async () => {
      if (!file) return null;
      file.status = "DELETING";
      return file;
    }),
    markDeleted: vi.fn(async () => {
      if (!file) return false;
      file.status = "DELETED";
      return true;
    }),
    releaseDeletion: vi.fn(async () => {
      if (!file) return false;
      file.status = "EXPIRED";
      return true;
    }),
    removeDeletedRecord: vi.fn(async () => {
      file = null;
      return true;
    }),
    expireDueFiles: vi.fn(async () => 0),
    findDeletionCandidateIds: vi.fn(async () => []),
  } satisfies FileManagementRepository;
  const objectStore = {
    deleteObject: vi.fn(async () => {}),
    inspectObject: vi.fn(async () => null),
  };
  const service = createManageOwnerFile({
    repository,
    getCipher: () => cipher,
    getObjectStore: () => objectStore,
    clock: () => now,
  });
  return { service, repository, objectStore, token, file, cipher };
}

describe("owner file management", () => {
  it("retrieves the same link without rotating its hash", async () => {
    const s = setup();
    expect(await s.service.share(s.file!.id, false)).toEqual({
      token: s.token,
    });
    expect(await s.service.share(s.file!.id, false)).toEqual({
      token: s.token,
    });
    expect(s.repository.storeLegacyShareToken).not.toHaveBeenCalled();
  });
  it("requires explicit confirmation for a legacy link and replaces it only once", async () => {
    const s = setup({ shareTokenCiphertext: null });
    await expect(s.service.share(s.file!.id, false)).rejects.toMatchObject({
      code: "CONFIRMATION_REQUIRED",
    });
    const newLink = await s.service.share(s.file!.id, true);
    expect(newLink.token).not.toBe(s.token);
    expect(s.file!.shareTokenHash).toBe(hashShareToken(newLink.token));
    expect(await s.service.share(s.file!.id, true)).toEqual(newLink);
    expect(s.repository.storeLegacyShareToken).toHaveBeenCalledTimes(1);
  });
  it("returns the persisted winner when a legacy reissue races another request", async () => {
    const s = setup({ shareTokenCiphertext: null });
    s.repository.storeLegacyShareToken.mockImplementationOnce(async () => {
      s.file!.shareTokenCiphertext = s.cipher.encrypt(
        s.token,
        s.file!.objectKey,
      );
      return false;
    });
    expect(await s.service.share(s.file!.id, true)).toEqual({ token: s.token });
  });
  it("preserves the scheduled expiry and rejects future link retrieval after manual expiry", async () => {
    const s = setup();
    const originalExpiry = s.file!.expiresAt;
    await s.service.expire(s.file!.id);
    await s.service.expire(s.file!.id);
    expect(s.file!.expiresAt).toEqual(originalExpiry);
    expect(s.file!.manuallyExpiredAt).toEqual(now);
    await expect(s.service.share(s.file!.id, true)).rejects.toMatchObject({
      code: "FILE_NOT_AVAILABLE",
    });
    expect(s.repository.expireReadyFile).toHaveBeenCalledTimes(1);
  });
  it.each(["READY", "PENDING", "FAILED"] as const)(
    "does not remove a %s file",
    async (status) => {
      const s = setup({ status });
      await expect(s.service.remove(s.file!.id)).rejects.toMatchObject({
        code: "FILE_NOT_EXPIRED",
      });
      expect(s.objectStore.deleteObject).not.toHaveBeenCalled();
    },
  );
  it("does not physically delete while an upload grant could still be usable", async () => {
    const s = setup({
      status: "EXPIRED",
      createdAt: new Date(now.getTime() - UPLOAD_DELETION_SAFETY_MS + 1),
    });
    await expect(s.service.remove(s.file!.id)).rejects.toMatchObject({
      code: "UPLOAD_GRANT_ACTIVE",
    });
    expect(s.objectStore.deleteObject).not.toHaveBeenCalled();
  });
  it("retains the record and releases the lease on storage failure", async () => {
    const s = setup({ status: "EXPIRED" });
    s.objectStore.deleteObject.mockRejectedValueOnce(
      new Error("fixture storage failure"),
    );
    await expect(s.service.remove(s.file!.id)).rejects.toThrow();
    expect(s.repository.releaseDeletion).toHaveBeenCalled();
    expect(s.repository.removeDeletedRecord).not.toHaveBeenCalled();
  });
  it("deletes storage before metadata and allows an idempotent retry", async () => {
    const s = setup({ status: "EXPIRED" });
    const id = s.file!.id;
    await s.service.remove(id);
    await s.service.remove(id);
    expect(s.objectStore.deleteObject.mock.invocationCallOrder[0]).toBeLessThan(
      s.repository.removeDeletedRecord.mock.invocationCallOrder[0],
    );
    expect(s.repository.removeDeletedRecord).toHaveBeenCalledTimes(1);
  });
  it("retains metadata when another worker owns or replaces the lease", async () => {
    const s = setup({ status: "EXPIRED" });
    s.repository.claimForDeletion.mockResolvedValueOnce(null);
    await expect(s.service.remove(s.file!.id)).rejects.toMatchObject({
      code: "FILE_BUSY",
    });
    s.repository.markDeleted.mockResolvedValueOnce(false);
    await expect(s.service.remove(s.file!.id)).rejects.toMatchObject({
      code: "FILE_BUSY",
    });
    expect(s.repository.removeDeletedRecord).not.toHaveBeenCalled();
  });
});
