import type { FileRecord } from "../../domain/file-record";
import type { FileCleanupRepository } from "./file-cleanup-repository";

export interface FileManagementRepository extends FileCleanupRepository {
  findById(id: string): Promise<FileRecord | null>;
  expireReadyFile(id: string, now: Date): Promise<boolean>;
  expireDueFile(id: string, now: Date): Promise<void>;
  storeLegacyShareToken(
    id: string,
    expectedHash: string,
    hash: string,
    ciphertext: string,
    now: Date,
  ): Promise<boolean>;
  removeDeletedRecord(id: string): Promise<boolean>;
}
