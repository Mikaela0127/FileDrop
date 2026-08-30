import { createHash, randomUUID } from "node:crypto";

import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, afterEach, describe, expect, it } from "vitest";

import { PrismaClient } from "../../../../generated/prisma/client";
import type { FileStatus } from "../../domain/file-record";
import { PrismaFileRepository } from "./prisma-file-repository";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for database integration tests");
}

const client = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});
const repository = new PrismaFileRepository(client);
const createdFileIds: string[] = [];

async function createFileForCleanup(
  status: FileStatus,
  expiresAt: Date,
  updatedAt?: Date,
) {
  const file = await repository.create({
    shareTokenHash: createHash("sha256").update(randomUUID()).digest("hex"),
    objectKey: `objects/${randomUUID()}`,
    originalName: "cleanup.bin",
    contentType: "application/octet-stream",
    sizeBytes: 42,
    status,
    expiresAt,
    uploadedAt:
      status === "READY" ? new Date(expiresAt.getTime() - 1_000) : null,
  });
  createdFileIds.push(file.id);

  if (updatedAt) {
    await client.file.update({
      where: { id: file.id },
      data: { updatedAt },
    });
  }

  return file;
}

afterEach(async () => {
  await client.file.deleteMany({ where: { id: { in: createdFileIds } } });
  createdFileIds.length = 0;
});

afterAll(async () => {
  await client.$disconnect();
});

describe("PrismaFileRepository", () => {
  it("persists metadata and retrieves it by the hashed share token", async () => {
    const shareTokenHash = createHash("sha256")
      .update(randomUUID())
      .digest("hex");
    const expiresAt = new Date(Date.now() + 86_400_000);

    const createdFile = await repository.create({
      shareTokenHash,
      objectKey: `uploads/${randomUUID()}`,
      originalName: "architecture.pdf",
      contentType: "application/pdf",
      sizeBytes: 3_000_000_000,
      expiresAt,
    });
    createdFileIds.push(createdFile.id);

    const storedFile = await repository.findByShareTokenHash(shareTokenHash);

    expect(storedFile).toMatchObject({
      id: createdFile.id,
      originalName: "architecture.pdf",
      contentType: "application/pdf",
      sizeBytes: 3_000_000_000,
      status: "PENDING",
      downloadCount: 0,
      expiresAt,
    });
  });

  it("cannot bypass the 3 GB database constraint", async () => {
    const shareTokenHash = createHash("sha256")
      .update(randomUUID())
      .digest("hex");

    await expect(
      repository.create({
        shareTokenHash,
        objectKey: `uploads/${randomUUID()}`,
        originalName: "too-large.bin",
        contentType: "application/octet-stream",
        sizeBytes: 3_000_000_001,
        expiresAt: new Date(Date.now() + 86_400_000),
      }),
    ).rejects.toThrow();
  });

  it("atomically marks only a pending upload ready", async () => {
    const shareTokenHash = createHash("sha256")
      .update(randomUUID())
      .digest("hex");
    const uploadedAt = new Date();
    const createdFile = await repository.create({
      shareTokenHash,
      objectKey: `objects/${randomUUID()}`,
      originalName: "architecture.pdf",
      contentType: "application/pdf",
      sizeBytes: 42,
      expiresAt: new Date(Date.now() + 86_400_000),
    });
    createdFileIds.push(createdFile.id);

    const readyFile = await repository.markReadyIfPending(
      createdFile.id,
      uploadedAt,
    );
    const secondTransition = await repository.markFailedIfPending(
      createdFile.id,
    );
    const storedFile = await repository.findById(createdFile.id);

    expect(readyFile).toMatchObject({
      id: createdFile.id,
      status: "READY",
      uploadedAt,
    });
    expect(secondTransition).toBeNull();
    expect(storedFile).toMatchObject({
      id: createdFile.id,
      status: "READY",
      uploadedAt,
    });
  });

  it.each(["FAILED", "EXPIRED"] as const)(
    "moves a pending upload to %s without an uploaded timestamp",
    async (targetStatus) => {
      const shareTokenHash = createHash("sha256")
        .update(randomUUID())
        .digest("hex");
      const createdFile = await repository.create({
        shareTokenHash,
        objectKey: `objects/${randomUUID()}`,
        originalName: "architecture.pdf",
        contentType: "application/pdf",
        sizeBytes: 42,
        expiresAt: new Date(Date.now() + 86_400_000),
      });
      createdFileIds.push(createdFile.id);

      const transitionedFile =
        targetStatus === "FAILED"
          ? await repository.markFailedIfPending(createdFile.id)
          : await repository.markExpiredIfPending(createdFile.id);

      expect(transitionedFile).toMatchObject({
        id: createdFile.id,
        status: targetStatus,
        uploadedAt: null,
      });
    },
  );

  it("expires only due pending and ready records within the batch", async () => {
    const now = new Date("2026-08-30T08:00:00.000Z");
    const pending = await createFileForCleanup(
      "PENDING",
      new Date(now.getTime() - 2_000),
    );
    const ready = await createFileForCleanup(
      "READY",
      new Date(now.getTime() - 1_000),
    );
    const future = await createFileForCleanup(
      "PENDING",
      new Date(now.getTime() + 1_000),
    );
    const failed = await createFileForCleanup(
      "FAILED",
      new Date(now.getTime() - 3_000),
    );

    await expect(repository.expireDueFiles(now, 10)).resolves.toBe(2);

    await expect(repository.findById(pending.id)).resolves.toMatchObject({
      status: "EXPIRED",
    });
    await expect(repository.findById(ready.id)).resolves.toMatchObject({
      status: "EXPIRED",
    });
    await expect(repository.findById(future.id)).resolves.toMatchObject({
      status: "PENDING",
    });
    await expect(repository.findById(failed.id)).resolves.toMatchObject({
      status: "FAILED",
    });
  });

  it("claims cleanup work with a fenced, reclaimable deletion lease", async () => {
    const leaseAcquiredAt = new Date("2026-08-30T08:00:00.000Z");
    const staleLeaseBefore = new Date("2026-08-30T07:45:00.000Z");
    const expired = await createFileForCleanup(
      "EXPIRED",
      new Date("2026-08-29T08:00:00.000Z"),
      new Date("2026-08-30T07:30:00.000Z"),
    );
    const failed = await createFileForCleanup(
      "FAILED",
      new Date("2026-08-29T08:00:00.000Z"),
      new Date("2026-08-30T07:35:00.000Z"),
    );
    const staleDeleting = await createFileForCleanup(
      "DELETING",
      new Date("2026-08-29T08:00:00.000Z"),
      new Date("2026-08-30T07:40:00.000Z"),
    );
    await createFileForCleanup(
      "DELETING",
      new Date("2026-08-29T08:00:00.000Z"),
      new Date("2026-08-30T07:50:00.000Z"),
    );
    await createFileForCleanup(
      "READY",
      new Date("2026-08-31T08:00:00.000Z"),
      new Date("2026-08-30T07:20:00.000Z"),
    );

    const candidateIds = await repository.findDeletionCandidateIds(
      staleLeaseBefore,
      10,
    );

    expect(new Set(candidateIds)).toEqual(
      new Set([expired.id, failed.id, staleDeleting.id]),
    );

    const claim = await repository.claimForDeletion(
      expired.id,
      staleLeaseBefore,
      leaseAcquiredAt,
    );

    expect(claim).toMatchObject({
      id: expired.id,
      status: "DELETING",
      updatedAt: leaseAcquiredAt,
    });
    await expect(
      repository.claimForDeletion(
        expired.id,
        staleLeaseBefore,
        leaseAcquiredAt,
      ),
    ).resolves.toBeNull();

    const deletedAt = new Date("2026-08-30T08:00:01.000Z");
    await expect(
      repository.markDeleted(
        expired.id,
        new Date("2026-08-30T07:59:59.000Z"),
        deletedAt,
      ),
    ).resolves.toBe(false);
    await expect(
      repository.markDeleted(expired.id, leaseAcquiredAt, deletedAt),
    ).resolves.toBe(true);
    await expect(repository.findById(expired.id)).resolves.toMatchObject({
      status: "DELETED",
      deletedAt,
    });
  });

  it("releases only the worker that still owns the deletion lease", async () => {
    const leaseAcquiredAt = new Date("2026-08-30T08:00:00.000Z");
    const file = await createFileForCleanup(
      "FAILED",
      new Date("2026-08-29T08:00:00.000Z"),
    );
    const claim = await repository.claimForDeletion(
      file.id,
      new Date("2026-08-30T07:45:00.000Z"),
      leaseAcquiredAt,
    );

    expect(claim).not.toBeNull();
    await expect(
      repository.releaseDeletion(file.id, new Date("2026-08-30T07:59:59.000Z")),
    ).resolves.toBe(false);
    await expect(
      repository.releaseDeletion(file.id, leaseAcquiredAt),
    ).resolves.toBe(true);
    await expect(repository.findById(file.id)).resolves.toMatchObject({
      status: "EXPIRED",
    });
  });
});
