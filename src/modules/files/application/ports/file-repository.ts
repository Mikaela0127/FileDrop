import type { FileRecord, FileStatus } from "../../domain/file-record";

export interface CreateFileRecordInput {
  shareTokenHash: string;
  objectKey: string;
  originalName: string;
  contentType: string;
  sizeBytes: number;
  status?: FileStatus;
  expiresAt: Date;
  uploadedAt?: Date | null;
}

export interface FileRepository {
  create(input: CreateFileRecordInput): Promise<FileRecord>;
  findById(id: string): Promise<FileRecord | null>;
  findByShareTokenHash(shareTokenHash: string): Promise<FileRecord | null>;
  markExpiredIfPending(id: string): Promise<FileRecord | null>;
  markFailedIfPending(id: string): Promise<FileRecord | null>;
  markReadyIfPending(id: string, uploadedAt: Date): Promise<FileRecord | null>;
}
