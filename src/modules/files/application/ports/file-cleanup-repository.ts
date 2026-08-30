import type { FileRecord } from "../../domain/file-record";

export interface FileCleanupRepository {
  expireDueFiles(now: Date, limit: number): Promise<number>;
  findDeletionCandidateIds(
    staleLeaseBefore: Date,
    limit: number,
  ): Promise<string[]>;
  claimForDeletion(
    id: string,
    staleLeaseBefore: Date,
    leaseAcquiredAt: Date,
  ): Promise<FileRecord | null>;
  markDeleted(
    id: string,
    leaseAcquiredAt: Date,
    deletedAt: Date,
  ): Promise<boolean>;
  releaseDeletion(id: string, leaseAcquiredAt: Date): Promise<boolean>;
}
