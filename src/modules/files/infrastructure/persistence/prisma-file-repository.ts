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
import type { FileRecord, FileStatus } from "../../domain/file-record";

const FILE_STATUS_MAP: Record<PrismaFileStatus, FileStatus> = {
  PENDING: "PENDING",
  READY: "READY",
  FAILED: "FAILED",
  EXPIRED: "EXPIRED",
  DELETING: "DELETING",
  DELETED: "DELETED",
};

function toFileRecord(file: PrismaFile): FileRecord {
  const sizeBytes = Number(file.sizeBytes);

  if (!Number.isSafeInteger(sizeBytes)) {
    throw new Error(
      `File ${file.id} has a size outside JavaScript's safe range`,
    );
  }

  return {
    ...file,
    sizeBytes,
    status: FILE_STATUS_MAP[file.status],
  };
}

export class PrismaFileRepository
  implements FileRepository, FileCleanupRepository
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

  markExpiredIfPending(id: string): Promise<FileRecord | null> {
    return this.transitionPendingFile(id, { status: "EXPIRED" });
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

  async claimForDeletion(
    id: string,
    staleLeaseBefore: Date,
    leaseAcquiredAt: Date,
  ): Promise<FileRecord | null> {
    const [file] = await this.client.file.updateManyAndReturn({
      where: {
        id,
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
