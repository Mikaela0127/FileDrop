import { ABANDONED_UPLOAD_MILLISECONDS } from "../domain/file-policy";
import { UploadAbandonmentError } from "./abandon-upload";
import type { FileCleanupRepository } from "./ports/file-cleanup-repository";
import type { ObjectStore } from "./ports/object-store";

export const CLEANUP_BATCH_SIZE = 100;
export const DELETION_LEASE_MILLISECONDS = 15 * 60 * 1_000;

export interface CleanupExpiredFilesDependencies {
  // Reconciles a PENDING upload with storage; see abandon-upload.ts.
  abandonUpload: (fileId: string) => Promise<unknown>;
  fileCleanupRepository: FileCleanupRepository;
  objectStore: ObjectStore;
  clock?: () => Date;
  batchSize?: number;
  deletionLeaseMilliseconds?: number;
  onFailure?: (fileId: string, error: unknown) => void;
}

export interface CleanupExpiredFilesResult {
  expiredCount: number;
  reconciledCount: number;
  examinedCount: number;
  claimedCount: number;
  deletedCount: number;
  failedCount: number;
  skippedCount: number;
}

function requireValidDate(value: Date): Date {
  if (!Number.isFinite(value.getTime())) {
    throw new TypeError("Cannot clean up files with an invalid clock");
  }

  return value;
}

function requirePositiveInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TypeError(`${name} must be a positive safe integer`);
  }

  return value;
}

export function createCleanupExpiredFiles({
  abandonUpload,
  fileCleanupRepository,
  objectStore,
  clock = () => new Date(),
  batchSize = CLEANUP_BATCH_SIZE,
  deletionLeaseMilliseconds = DELETION_LEASE_MILLISECONDS,
  onFailure,
}: CleanupExpiredFilesDependencies) {
  requirePositiveInteger(batchSize, "batchSize");
  requirePositiveInteger(
    deletionLeaseMilliseconds,
    "deletionLeaseMilliseconds",
  );

  return async function cleanupExpiredFiles(): Promise<CleanupExpiredFilesResult> {
    const leaseAcquiredAt = requireValidDate(clock());
    const staleLeaseBefore = new Date(
      leaseAcquiredAt.getTime() - deletionLeaseMilliseconds,
    );
    const expiredCount = await fileCleanupRepository.expireDueFiles(
      leaseAcquiredAt,
      batchSize,
    );
    // Excludes due rows, which belong to expiry rather than abandonment.
    const abandonedIds = await fileCleanupRepository.findAbandonedUploadIds(
      new Date(leaseAcquiredAt.getTime() - ABANDONED_UPLOAD_MILLISECONDS),
      leaseAcquiredAt,
      batchSize,
    );
    let reconciledCount = 0;
    let failedCount = 0;
    let skippedCount = 0;

    for (const abandonedId of abandonedIds) {
      try {
        await abandonUpload(abandonedId);
        reconciledCount += 1;
      } catch (error) {
        if (error instanceof UploadAbandonmentError) {
          // The owner deleted the record since it was selected.
          skippedCount += 1;
          continue;
        }

        onFailure?.(abandonedId, error);
        failedCount += 1;
      }
    }

    const candidateIds = await fileCleanupRepository.findDeletionCandidateIds(
      staleLeaseBefore,
      batchSize,
    );
    const result: CleanupExpiredFilesResult = {
      expiredCount,
      reconciledCount,
      examinedCount: candidateIds.length,
      claimedCount: 0,
      deletedCount: 0,
      failedCount,
      skippedCount,
    };

    for (const candidateId of candidateIds) {
      const claimedFile = await fileCleanupRepository.claimForDeletion(
        candidateId,
        staleLeaseBefore,
        leaseAcquiredAt,
      );

      if (!claimedFile) {
        result.skippedCount += 1;
        continue;
      }

      result.claimedCount += 1;

      try {
        await objectStore.deleteObject(claimedFile.objectKey);
        const deletedAt = requireValidDate(clock());
        const markedDeleted = await fileCleanupRepository.markDeleted(
          claimedFile.id,
          claimedFile.updatedAt,
          deletedAt,
        );

        if (markedDeleted) {
          result.deletedCount += 1;
        } else {
          result.skippedCount += 1;
        }
      } catch (error) {
        onFailure?.(claimedFile.id, error);
        result.failedCount += 1;

        try {
          await fileCleanupRepository.releaseDeletion(
            claimedFile.id,
            claimedFile.updatedAt,
          );
        } catch {
          // A stale DELETING lease is reclaimable by a later cleanup run.
        }
      }
    }

    return result;
  };
}
