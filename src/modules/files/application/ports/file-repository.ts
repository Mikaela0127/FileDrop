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
  findByShareTokenHash(shareTokenHash: string): Promise<FileRecord | null>;
}
