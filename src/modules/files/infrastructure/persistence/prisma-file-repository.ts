import type {
  File as PrismaFile,
  FileStatus as PrismaFileStatus,
  PrismaClient,
} from "../../../../generated/prisma/client";
import type {
  CreateFileRecordInput,
  FileRepository,
} from "../../application/ports/file-repository";
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

export class PrismaFileRepository implements FileRepository {
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

  async findByShareTokenHash(
    shareTokenHash: string,
  ): Promise<FileRecord | null> {
    const file = await this.client.file.findUnique({
      where: { shareTokenHash },
    });

    return file ? toFileRecord(file) : null;
  }
}
