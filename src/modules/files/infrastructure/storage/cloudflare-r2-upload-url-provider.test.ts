import {
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";
import { describe, expect, it, vi } from "vitest";

import {
  CloudflareR2UploadUrlProvider,
  R2UploadRequestError,
  type CloudflareR2UploadUrlProviderDependencies,
} from "./cloudflare-r2-upload-url-provider";
import type { R2StorageConfig } from "../../../../lib/config/r2-storage-config";

const now = new Date("2026-08-25T08:00:00.000Z");
const objectKey = "objects/123e4567-e89b-42d3-a456-426614174000";
const configuration: R2StorageConfig = {
  accountId: "0123456789abcdef0123456789abcdef",
  accessKeyId: "example-access-key-id",
  secretAccessKey: "example-secret-key-not-a-real-credential",
  bucketName: "filedrop-test",
};

const uploadInput = {
  objectKey,
  contentType: "application/pdf",
  sizeBytes: 3_000_000_000,
  expiresInSeconds: 900,
};

describe("CloudflareR2UploadUrlProvider", () => {
  it("creates a scoped PUT command and signs the required content type", async () => {
    const createClient = vi.fn(
      (clientConfiguration: S3ClientConfig) =>
        new S3Client(clientConfiguration),
    );
    const presignUpload = vi.fn(
      async (
        _client: S3Client,
        _command: PutObjectCommand,
        _options: {
          expiresIn: number;
          signingDate: Date;
          signableHeaders: Set<string>;
        },
      ) => {
        expect(_client).toBeInstanceOf(S3Client);
        expect(_command).toBeInstanceOf(PutObjectCommand);
        expect(_options.expiresIn).toBe(900);
        return "https://storage.example.test/upload?signature=redacted";
      },
    );
    const dependencies: CloudflareR2UploadUrlProviderDependencies = {
      clock: () => now,
      createClient,
      presignUpload,
    };
    const provider = new CloudflareR2UploadUrlProvider(
      configuration,
      dependencies,
    );

    const authorization = await provider.createUploadUrl(uploadInput);

    expect(createClient).toHaveBeenCalledWith({
      region: "auto",
      endpoint:
        "https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com",
      credentials: {
        accessKeyId: "example-access-key-id",
        secretAccessKey: "example-secret-key-not-a-real-credential",
      },
    });

    const [, command, options] = presignUpload.mock.calls[0];
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect(command.input).toEqual({
      Bucket: "filedrop-test",
      Key: objectKey,
      ContentType: "application/pdf",
    });
    expect(command.input).not.toHaveProperty("ContentLength");
    expect(options).toEqual({
      expiresIn: 900,
      signingDate: now,
      signableHeaders: new Set(["content-type"]),
    });
    expect(authorization).toEqual({
      url: "https://storage.example.test/upload?signature=redacted",
      method: "PUT",
      headers: { "content-type": "application/pdf" },
      expiresAt: new Date("2026-08-25T08:15:00.000Z"),
    });
  });

  it("generates an R2 SigV4 URL locally without exposing the secret key", async () => {
    const provider = new CloudflareR2UploadUrlProvider(configuration, {
      clock: () => now,
    });

    const authorization = await provider.createUploadUrl(uploadInput);
    const url = new URL(authorization.url);

    expect(url.protocol).toBe("https:");
    expect(url.hostname).toContain(
      "0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com",
    );
    expect(decodeURIComponent(url.pathname)).toContain(objectKey);
    expect(url.searchParams.get("X-Amz-Expires")).toBe("900");
    expect(url.searchParams.get("X-Amz-SignedHeaders")).toContain(
      "content-type",
    );
    expect(authorization.url).not.toContain(configuration.secretAccessKey);
  });

  it.each([
    { ...uploadInput, objectKey: "objects/private-plan.pdf" },
    { ...uploadInput, contentType: "application/pdf\r\nx-unsafe: value" },
    { ...uploadInput, sizeBytes: 3_000_000_001 },
    { ...uploadInput, expiresInSeconds: 901 },
  ])("rejects an unsafe request before signing", async (unsafeInput) => {
    const presignUpload = vi.fn();
    const provider = new CloudflareR2UploadUrlProvider(configuration, {
      presignUpload,
    });

    await expect(provider.createUploadUrl(unsafeInput)).rejects.toThrowError(
      R2UploadRequestError,
    );
    expect(presignUpload).not.toHaveBeenCalled();
  });

  it("does not convert storage errors into messages containing credentials", async () => {
    const provider = new CloudflareR2UploadUrlProvider(configuration, {
      presignUpload: vi.fn(async () => {
        throw new Error("R2 signing failed");
      }),
    });

    await expect(provider.createUploadUrl(uploadInput)).rejects.toThrow(
      "R2 signing failed",
    );
  });
});
