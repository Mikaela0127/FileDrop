import { isAbandonedUpload } from "../domain/file-policy";
import type { FileStatus } from "../domain/file-record";
import {
  UploadCompletionError,
  type CompleteUploadResult,
} from "./complete-upload";
import type { FileRepository } from "./ports/file-repository";

export class UploadAbandonmentError extends Error {
  constructor(readonly code: "UPLOAD_NOT_FOUND") {
    super(code);
    this.name = "UploadAbandonmentError";
  }
}

export interface AbandonUploadDependencies {
  completeUpload: (fileId: string) => Promise<CompleteUploadResult>;
  fileRepository: Pick<FileRepository, "findById" | "markFailedIfPending">;
  clock?: () => Date;
}

export interface AbandonUploadResult {
  fileId: string;
  status: FileStatus;
}

// Reconcile a PENDING upload with storage (ADR 0019). A failed or lost browser
// response does not prove that R2 rejected the PUT, so storage decides: a
// matching object completes the upload, and completion itself records expiry
// and mismatches. An absent object proves nothing while a PUT could still
// commit, so it fails the row only once the upload is six hours old.
export function createAbandonUpload({
  completeUpload,
  fileRepository,
  clock = () => new Date(),
}: AbandonUploadDependencies) {
  return async function abandonUpload(
    fileId: string,
  ): Promise<AbandonUploadResult> {
    // Taken before storage is inspected, so an absence seen before the cutoff
    // can never fail the row after it.
    const inspectedAfter = clock();

    try {
      const completed = await completeUpload(fileId);
      return { fileId, status: completed.status };
    } catch (error) {
      if (!(error instanceof UploadCompletionError)) {
        throw error;
      }

      if (error.code === "UPLOAD_NOT_FOUND") {
        throw new UploadAbandonmentError("UPLOAD_NOT_FOUND");
      }

      if (error.code === "OBJECT_NOT_FOUND") {
        const pending = await fileRepository.findById(fileId);

        if (pending && isAbandonedUpload(pending.createdAt, inspectedAfter)) {
          await fileRepository.markFailedIfPending(fileId);
        }
      }
    }

    const file = await fileRepository.findById(fileId);

    if (!file) {
      throw new UploadAbandonmentError("UPLOAD_NOT_FOUND");
    }

    return { fileId, status: file.status };
  };
}
