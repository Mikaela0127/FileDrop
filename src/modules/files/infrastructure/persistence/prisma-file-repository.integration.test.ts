import { createHash, randomUUID } from "node:crypto";

import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, afterEach, describe, expect, it } from "vitest";

import { PrismaClient } from "../../../../generated/prisma/client";
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
});
