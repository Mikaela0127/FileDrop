import { randomUUID } from "node:crypto";

import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, afterEach, describe, expect, it } from "vitest";

import { PrismaClient } from "../../../generated/prisma/client";
import { hashShareToken } from "../domain/share-token";
import { PrismaFileRepository } from "../infrastructure/persistence/prisma-file-repository";
import { createInitializeUpload } from "./initialize-upload";
import type { UploadUrlProvider } from "./ports/upload-url-provider";

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

describe("initializeUpload with PostgreSQL", () => {
  it("persists the hash but never the bearer token or signed URL", async () => {
    const now = new Date("2026-08-24T08:00:00.000Z");
    const rawShareToken = "b".repeat(43);
    const objectKey = `objects/${randomUUID()}`;
    const uploadUrlProvider: UploadUrlProvider = {
      async createUploadUrl(input) {
        return {
          url: "https://storage.example.test/upload?authorization=placeholder",
          method: "PUT",
          headers: { "content-type": input.contentType },
          expiresAt: new Date(now.getTime() + 900_000),
        };
      },
    };
    const initializeUpload = createInitializeUpload({
      fileRepository: repository,
      uploadUrlProvider,
      clock: () => now,
      createObjectKey: () => objectKey,
      createShareToken: () => rawShareToken,
    });

    const result = await initializeUpload({
      originalName: "portfolio.pdf",
      contentType: "application/pdf",
      sizeBytes: 1_024,
      expirationSeconds: 3_600,
    });
    createdFileIds.push(result.fileId);

    const storedFile = await client.file.findUniqueOrThrow({
      where: { id: result.fileId },
    });
    const serializedRecord = JSON.stringify(storedFile, (_, value) =>
      typeof value === "bigint" ? value.toString() : value,
    );

    expect(storedFile.shareTokenHash).toBe(hashShareToken(rawShareToken));
    expect(storedFile.objectKey).toBe(objectKey);
    expect(serializedRecord).not.toContain(rawShareToken);
    expect(serializedRecord).not.toContain("storage.example.test");
  });
});
