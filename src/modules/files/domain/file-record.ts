export const FILE_STATUSES = [
  "PENDING",
  "READY",
  "FAILED",
  "EXPIRED",
  "DELETING",
  "DELETED",
] as const;

export type FileStatus = (typeof FILE_STATUSES)[number];

export interface FileRecord {
  id: string;
  shareTokenHash: string;
  objectKey: string;
  originalName: string;
  contentType: string;
  sizeBytes: number;
  status: FileStatus;
  expiresAt: Date;
  uploadedAt: Date | null;
  downloadCount: number;
  lastDownloadedAt: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
