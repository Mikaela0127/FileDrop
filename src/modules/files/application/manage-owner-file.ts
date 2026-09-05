import { generateShareToken, hashShareToken } from "../domain/share-token";
import type { FileManagementRepository } from "./ports/file-management-repository";
import type { ShareTokenCipher } from "./ports/share-token-cipher";
import type { ObjectStore } from "./ports/object-store";
import { DELETION_LEASE_MILLISECONDS } from "./cleanup-expired-files";
import { UPLOAD_URL_TTL_SECONDS } from "./ports/upload-url-provider";

export const UPLOAD_DELETION_SAFETY_MS =
  UPLOAD_URL_TTL_SECONDS * 1000 + DELETION_LEASE_MILLISECONDS;
export class FileManagementError extends Error {
  constructor(
    readonly code:
      | "FILE_NOT_FOUND"
      | "FILE_NOT_AVAILABLE"
      | "CONFIRMATION_REQUIRED"
      | "FILE_NOT_EXPIRED"
      | "UPLOAD_GRANT_ACTIVE"
      | "FILE_BUSY",
  ) {
    super(code);
  }
}

export function createManageOwnerFile(deps: {
  repository: FileManagementRepository;
  getCipher: () => ShareTokenCipher;
  getObjectStore: () => ObjectStore;
  clock?: () => Date;
}) {
  const { repository } = deps;
  const clock = deps.clock ?? (() => new Date());
  return {
    async share(id: string, confirmed: boolean) {
      let file = await repository.findById(id);
      if (!file) throw new FileManagementError("FILE_NOT_FOUND");
      if (file.status !== "READY" || file.expiresAt <= clock())
        throw new FileManagementError("FILE_NOT_AVAILABLE");
      const cipher = deps.getCipher();
      if (!file.shareTokenCiphertext) {
        if (!confirmed) throw new FileManagementError("CONFIRMATION_REQUIRED");
        const token = generateShareToken();
        const hash = hashShareToken(token);
        await repository.storeLegacyShareToken(
          id,
          file.shareTokenHash,
          hash,
          cipher.encrypt(token, file.objectKey),
          clock(),
        );
        // A concurrent request may have won. Always return the persisted token, not a losing proposal.
        file = await repository.findById(id);
      }
      if (
        !file ||
        file.status !== "READY" ||
        file.expiresAt <= clock() ||
        !file.shareTokenCiphertext
      )
        throw new FileManagementError("FILE_NOT_AVAILABLE");
      const token = cipher.decrypt(file.shareTokenCiphertext, file.objectKey);
      if (hashShareToken(token) !== file.shareTokenHash)
        throw new Error("SHARE_TOKEN_INTEGRITY_FAILED");
      return { token };
    },
    async expire(id: string) {
      const file = await repository.findById(id);
      if (!file) throw new FileManagementError("FILE_NOT_FOUND");
      if (file.manuallyExpiredAt) return;
      if (!(await repository.expireReadyFile(id, clock())))
        throw new FileManagementError("FILE_NOT_AVAILABLE");
    },
    async remove(id: string) {
      const now = clock();
      await repository.expireDueFile(id, now);
      const file = await repository.findById(id);
      if (!file) return; // Retrying a successful deletion is safe.
      if (!["EXPIRED", "DELETED", "DELETING"].includes(file.status))
        throw new FileManagementError("FILE_NOT_EXPIRED");
      if (now.getTime() - file.createdAt.getTime() < UPLOAD_DELETION_SAFETY_MS)
        throw new FileManagementError("UPLOAD_GRANT_ACTIVE");
      if (file.status !== "DELETED") {
        const lease = await repository.claimForDeletion(
          id,
          new Date(now.getTime() - DELETION_LEASE_MILLISECONDS),
          now,
        );
        if (!lease) throw new FileManagementError("FILE_BUSY");
        try {
          await deps.getObjectStore().deleteObject(lease.objectKey);
          if (!(await repository.markDeleted(id, lease.updatedAt, clock())))
            throw new FileManagementError("FILE_BUSY");
        } catch (error) {
          try {
            await repository.releaseDeletion(id, lease.updatedAt);
          } catch {
            /* Cron can reclaim the lease. */
          }
          throw error;
        }
      }
      if (
        !(await repository.removeDeletedRecord(id)) &&
        (await repository.findById(id))
      )
        throw new FileManagementError("FILE_BUSY");
    },
  };
}
