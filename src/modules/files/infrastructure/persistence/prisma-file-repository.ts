import type {
  File as PrismaFile,
  FileStatus as PrismaFileStatus,
  PrismaClient,
} from "../../../../generated/prisma/client";
import type {
  CreateFileRecordInput,
  FileRepository,
} from "../../application/ports/file-repository";
import type { FileCleanupRepository } from "../../application/ports/file-cleanup-repository";
import type { DownloadStatisticsRepository } from "../../application/ports/download-statistics-repository";
import type {
  OwnerFileCatalogItem,
  OwnerFileCatalogRepository,
} from "../../application/ports/owner-file-catalog-repository";
import type { FileRecord, FileStatus } from "../../domain/file-record";
import { UPLOAD_DELETION_SAFETY_MS } from "../../application/manage-owner-file";
import type { FileManagementRepository } from "../../application/ports/file-management-repository";

const FILE_STATUS_MAP: Record<PrismaFileStatus, FileStatus> = {
  PENDING: "PENDING",
  READY: "READY",
  FAILED: "FAILED",
  EXPIRED: "EXPIRED",
  DELETING: "DELETING",
  DELETED: "DELETED",
};

function toFileRecord(file: PrismaFile): FileRecord {
  const sizeBytes = toSafeFileSize(file.id, file.sizeBytes);

  return {
    ...file,
    sizeBytes,
    status: FILE_STATUS_MAP[file.status],
  };
}

function toSafeFileSize(fileId: string, sizeBytes: bigint): number {
  const numericSize = Number(sizeBytes);

  if (!Number.isSafeInteger(numericSize)) {
    throw new Error(
      `File ${fileId} has a size outside JavaScript's safe range`,
    );
  }

  return numericSize;
}

export class PrismaFileRepository
  implements
    FileRepository,
    FileManagementRepository,
    FileCleanupRepository,
    DownloadStatisticsRepository,
    OwnerFileCatalogRepository
{
  constructor(private readonly client: PrismaClient) {}

  async create(input: CreateFileRecordInput): Promise<FileRecord> {
    const file = await this.client.file.create({
      data: {
        ...input,
        sizeBytes: BigInt(input.sizeBytes),
      },
    });

    return toFileRecord(file);
  }

  async findById(id: string): Promise<FileRecord | null> {
    const file = await this.client.file.findUnique({ where: { id } });

    return file ? toFileRecord(file) : null;
  }

  async findByShareTokenHash(
    shareTokenHash: string,
  ): Promise<FileRecord | null> {
    const file = await this.client.file.findUnique({
      where: { shareTokenHash },
    });

    return file ? toFileRecord(file) : null;
  }

  async listRecent(limit: number): Promise<OwnerFileCatalogItem[]> {
    if (!Number.isSafeInteger(limit) || limit < 1) {
      throw new RangeError("File catalog limit must be a positive integer");
    }

    const files = await this.client.file.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit,
      select: {
        id: true,
        originalName: true,
        contentType: true,
        sizeBytes: true,
        status: true,
        expiresAt: true,
        downloadCount: true,
        lastDownloadedAt: true,
        createdAt: true,
        shareTokenCiphertext: true,
        manuallyExpiredAt: true,
      },
    });

    return files.map(({ shareTokenCiphertext, ...file }) => ({
      ...file,
      canRecoverShareLink: shareTokenCiphertext !== null,
      sizeBytes: toSafeFileSize(file.id, file.sizeBytes),
      status: FILE_STATUS_MAP[file.status],
    }));
  }

  markExpiredIfPending(id: string): Promise<FileRecord | null> {
    return this.transitionPendingFile(id, { status: "EXPIRED" });
  }

  async expireReadyFile(id: string, now: Date): Promise<boolean> {
    const result = await this.client.file.updateMany({
      where: { id, status: "READY", expiresAt: { gt: now } },
      data: { status: "EXPIRED", manuallyExpiredAt: now },
    });
    return result.count === 1;
  }

  async expireDueFile(id: string, now: Date): Promise<void> {
    await this.client.file.updateMany({
      where: {
        id,
        status: { in: ["READY", "PENDING"] },
        expiresAt: { lte: now },
      },
      data: { status: "EXPIRED" },
    });
  }

  async storeLegacyShareToken(
    id: string,
    expectedHash: string,
    hash: string,
    ciphertext: string,
    now: Date,
  ): Promise<boolean> {
    const result = await this.client.file.updateMany({
      where: {
        id,
        shareTokenHash: expectedHash,
        shareTokenCiphertext: null,
        status: "READY",
        expiresAt: { gt: now },
      },
      data: { shareTokenHash: hash, shareTokenCiphertext: ciphertext },
    });
    return result.count === 1;
  }

  async removeDeletedRecord(id: string): Promise<boolean> {
    const result = await this.client.file.deleteMany({
      where: { id, status: "DELETED" },
    });
    return result.count === 1;
  }

  markFailedIfPending(id: string): Promise<FileRecord | null> {
    return this.transitionPendingFile(id, { status: "FAILED" });
  }

  markReadyIfPending(id: string, uploadedAt: Date): Promise<FileRecord | null> {
    return this.transitionPendingFile(id, {
      status: "READY",
      uploadedAt,
    });
  }

  async expireDueFiles(now: Date, limit: number): Promise<number> {
    const update = await this.client.file.updateMany({
      where: {
        status: { in: ["PENDING", "READY"] },
        expiresAt: { lte: now },
      },
      data: { status: "EXPIRED" },
      limit,
    });

    return update.count;
  }

  async findDeletionCandidateIds(
    staleLeaseBefore: Date,
    limit: number,
  ): Promise<string[]> {
    const files = await this.client.file.findMany({
      where: {
        createdAt: { lte: new Date(Date.now() - UPLOAD_DELETION_SAFETY_MS) },
        OR: [
          { status: { in: ["EXPIRED", "FAILED"] } },
          { status: "DELETING", updatedAt: { lte: staleLeaseBefore } },
        ],
      },
      orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
      select: { id: true },
      take: limit,
    });

    return files.map((file) => file.id);
  }

  async recordDownloadAuthorization(
    fileId: string,
    authorizedAt: Date,
  ): Promise<boolean> {
    const eligibility = {
      id: fileId,
      status: "READY" as const,
      expiresAt: { gt: authorizedAt },
    };
    const [countUpdate] = await this.client.$transaction([
      this.client.file.updateMany({
        where: eligibility,
        data: { downloadCount: { increment: 1 } },
      }),
      this.client.file.updateMany({
        where: {
          ...eligibility,
          OR: [
            { lastDownloadedAt: null },
            { lastDownloadedAt: { lt: authorizedAt } },
          ],
        },
        data: { lastDownloadedAt: authorizedAt },
      }),
    ]);

    return countUpdate.count === 1;
  }

  async claimForDeletion(
    id: string,
    staleLeaseBefore: Date,
    leaseAcquiredAt: Date,
  ): Promise<FileRecord | null> {
    const [file] = await this.client.file.updateManyAndReturn({
      where: {
        id,
        createdAt: {
          lte: new Date(leaseAcquiredAt.getTime() - UPLOAD_DELETION_SAFETY_MS),
        },
        OR: [
          { status: { in: ["EXPIRED", "FAILED"] } },
          { status: "DELETING", updatedAt: { lte: staleLeaseBefore } },
        ],
      },
      data: { status: "DELETING", updatedAt: leaseAcquiredAt },
    });

    return file ? toFileRecord(file) : null;
  }

  async markDeleted(
    id: string,
    leaseAcquiredAt: Date,
    deletedAt: Date,
  ): Promise<boolean> {
    const update = await this.client.file.updateMany({
      where: { id, status: "DELETING", updatedAt: leaseAcquiredAt },
      data: { status: "DELETED", deletedAt },
    });

    return update.count === 1;
  }

  async releaseDeletion(id: string, leaseAcquiredAt: Date): Promise<boolean> {
    const update = await this.client.file.updateMany({
      where: { id, status: "DELETING", updatedAt: leaseAcquiredAt },
      data: { status: "EXPIRED" },
    });

    return update.count === 1;
  }

  private async transitionPendingFile(
    id: string,
    data:
      { status: "EXPIRED" | "FAILED" } | { status: "READY"; uploadedAt: Date },
  ): Promise<FileRecord | null> {
    const update = await this.client.file.updateMany({
      where: { id, status: "PENDING" },
      data,
    });

    if (update.count !== 1) {
      return null;
    }

    const file = await this.client.file.findUniqueOrThrow({ where: { id } });
    return toFileRecord(file);
  }
}
