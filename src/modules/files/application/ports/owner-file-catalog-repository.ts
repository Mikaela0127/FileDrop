import type { FileStatus } from "../../domain/file-record";

export interface OwnerFileCatalogItem {
  id: string;
  originalName: string;
  contentType: string;
  sizeBytes: number;
  status: FileStatus;
  expiresAt: Date;
  downloadCount: number;
  lastDownloadedAt: Date | null;
  createdAt: Date;
}

export interface OwnerFileCatalogRepository {
  listRecent(limit: number): Promise<OwnerFileCatalogItem[]>;
}
