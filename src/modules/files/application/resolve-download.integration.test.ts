import { randomUUID } from "node:crypto";

import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

import { PrismaClient } from "../../../generated/prisma/client";
import { PrismaFileRepository } from "../infrastructure/persistence/prisma-file-repository";
import { hashShareToken } from "../domain/share-token";
import { createResolveDownload } from "./resolve-download";
import type { DownloadUrlProvider } from "./ports/download-url-provider";

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

describe("resolveDownload with PostgreSQL", () => {
  it("resolves a ready file by hashing the raw bearer token", async () => {
    const now = new Date("2026-08-30T08:00:00.000Z");
    const shareToken = Buffer.alloc(32, 9).toString("base64url");
    const createdFile = await repository.create({
      shareTokenHash: hashShareToken(shareToken),
      objectKey: `objects/${randomUUID()}`,
      originalName: "portfolio.pdf",
      contentType: "application/pdf",
      sizeBytes: 1_024,
      expiresAt: new Date(now.getTime() + 86_400_000),
    });
    createdFileIds.push(createdFile.id);
    await repository.markReadyIfPending(createdFile.id, now);

    const downloadUrlProvider: DownloadUrlProvider = {
      createDownloadUrl: vi.fn(async (input) => ({
        url: "https://storage.example.test/download?signature=redacted",
        expiresAt: new Date(now.getTime() + input.expiresInSeconds * 1_000),
      })),
    };
    const resolveDownload = createResolveDownload({
      fileRepository: repository,
      downloadUrlProvider,
      clock: () => now,
    });

    await expect(resolveDownload(shareToken)).resolves.toEqual({
      url: "https://storage.example.test/download?signature=redacted",
      expiresAt: new Date("2026-08-30T08:05:00.000Z"),
    });
    expect(downloadUrlProvider.createDownloadUrl).toHaveBeenCalledWith({
      objectKey: createdFile.objectKey,
      originalName: "portfolio.pdf",
      expiresInSeconds: 300,
    });
  });
});
