import type { FileRecord } from "../domain/file-record";
import type { FileRepository } from "./ports/file-repository";
import type { ObjectStore } from "./ports/object-store";

export type UploadCompletionErrorCode =
  | "UPLOAD_NOT_FOUND"
  | "UPLOAD_NOT_COMPLETABLE"
  | "OBJECT_NOT_FOUND"
  | "OBJECT_MISMATCH"
  | "UPLOAD_EXPIRED";

export class UploadCompletionError extends Error {
  constructor(
    readonly code: UploadCompletionErrorCode,
    readonly cleanupPending = false,
  ) {
    super(code);
    this.name = "UploadCompletionError";
  }
}

export interface CompleteUploadDependencies {
  fileRepository: FileRepository;
  objectStore: ObjectStore;
  clock?: () => Date;
}

export interface CompleteUploadResult {
  expiresAt: Date;
  fileId: string;
  status: "READY";
  uploadedAt: Date;
}

function toCompletionResult(file: FileRecord): CompleteUploadResult {
  if (file.status !== "READY" || !file.uploadedAt) {
    throw new UploadCompletionError("UPLOAD_NOT_COMPLETABLE");
  }

  return {
    expiresAt: new Date(file.expiresAt),
    fileId: file.id,
    status: "READY",
    uploadedAt: new Date(file.uploadedAt),
  };
}

async function resolveConcurrentTransition(
  fileRepository: FileRepository,
  fileId: string,
): Promise<CompleteUploadResult> {
  const currentFile = await fileRepository.findById(fileId);

  if (currentFile?.status === "READY") {
    return toCompletionResult(currentFile);
  }

  throw new UploadCompletionError("UPLOAD_NOT_COMPLETABLE");
}

async function deleteRejectedObject(
  objectStore: ObjectStore,
  objectKey: string,
): Promise<boolean> {
  try {
    await objectStore.deleteObject(objectKey);
    return false;
  } catch {
    return true;
  }
}

export function createCompleteUpload({
  fileRepository,
  objectStore,
  clock = () => new Date(),
}: CompleteUploadDependencies) {
  return async function completeUpload(
    fileId: string,
  ): Promise<CompleteUploadResult> {
    const file = await fileRepository.findById(fileId);

    if (!file) {
      throw new UploadCompletionError("UPLOAD_NOT_FOUND");
    }

    if (file.status === "READY") {
      return toCompletionResult(file);
    }

    if (file.status !== "PENDING") {
      throw new UploadCompletionError("UPLOAD_NOT_COMPLETABLE");
    }

    const now = clock();

    if (!Number.isFinite(now.getTime())) {
      throw new TypeError("Cannot complete upload with an invalid clock");
    }

    if (file.expiresAt <= now) {
      const expiredFile = await fileRepository.markExpiredIfPending(file.id);

      if (!expiredFile) {
        return resolveConcurrentTransition(fileRepository, file.id);
      }

      const cleanupPending = await deleteRejectedObject(
        objectStore,
        file.objectKey,
      );
      throw new UploadCompletionError("UPLOAD_EXPIRED", cleanupPending);
    }

    const storedObject = await objectStore.inspectObject(file.objectKey);

    if (!storedObject) {
      throw new UploadCompletionError("OBJECT_NOT_FOUND");
    }

    if (
      storedObject.sizeBytes !== file.sizeBytes ||
      storedObject.contentType !== file.contentType
    ) {
      const failedFile = await fileRepository.markFailedIfPending(file.id);

      if (!failedFile) {
        return resolveConcurrentTransition(fileRepository, file.id);
      }

      const cleanupPending = await deleteRejectedObject(
        objectStore,
        file.objectKey,
      );
      throw new UploadCompletionError("OBJECT_MISMATCH", cleanupPending);
    }

    const readyFile = await fileRepository.markReadyIfPending(file.id, now);

    return readyFile
      ? toCompletionResult(readyFile)
      : resolveConcurrentTransition(fileRepository, file.id);
  };
}
