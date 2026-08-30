import {
  GetObjectCommand,
  S3Client,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";
import { describe, expect, it, vi } from "vitest";

import type { R2StorageConfig } from "../../../../lib/config/r2-storage-config";
import {
  attachmentContentDisposition,
  CloudflareR2DownloadUrlProvider,
  R2DownloadRequestError,
  type CloudflareR2DownloadUrlProviderDependencies,
} from "./cloudflare-r2-download-url-provider";

const now = new Date("2026-08-30T08:00:00.000Z");
const objectKey = "objects/123e4567-e89b-42d3-a456-426614174000";
const configuration: R2StorageConfig = {
  accountId: "0123456789abcdef0123456789abcdef",
  accessKeyId: "example-access-key-id",
  secretAccessKey: "example-secret-key-not-a-real-credential",
  bucketName: "filedrop-test",
};
const downloadInput = {
  objectKey,
  originalName: "architecture.pdf",
  expiresInSeconds: 300,
};

describe("CloudflareR2DownloadUrlProvider", () => {
  it("creates a scoped attachment GET authorization", async () => {
    const createClient = vi.fn(
      (clientConfiguration: S3ClientConfig) =>
        new S3Client(clientConfiguration),
    );
    const presignDownload = vi.fn(
      async (
        client: S3Client,
        command: GetObjectCommand,
        options: { expiresIn: number; signingDate: Date },
      ) => {
        expect(client).toBeInstanceOf(S3Client);
        expect(command).toBeInstanceOf(GetObjectCommand);
        expect(options).toEqual({ expiresIn: 300, signingDate: now });
        return "https://storage.example.test/download?signature=redacted";
      },
    );
    const dependencies: CloudflareR2DownloadUrlProviderDependencies = {
      clock: () => now,
      createClient,
      presignDownload,
    };
    const provider = new CloudflareR2DownloadUrlProvider(
      configuration,
      dependencies,
    );

    const authorization = await provider.createDownloadUrl(downloadInput);

    expect(createClient).toHaveBeenCalledWith({
      region: "auto",
      endpoint:
        "https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com",
      credentials: {
        accessKeyId: "example-access-key-id",
        secretAccessKey: "example-secret-key-not-a-real-credential",
      },
    });
    const [, command, options] = presignDownload.mock.calls[0];
    expect(command.input).toEqual({
      Bucket: "filedrop-test",
      Key: objectKey,
      ResponseContentDisposition:
        "attachment; filename=\"architecture.pdf\"; filename*=UTF-8''architecture.pdf",
    });
    expect(options).toEqual({ expiresIn: 300, signingDate: now });
    expect(authorization).toEqual({
      url: "https://storage.example.test/download?signature=redacted",
      expiresAt: new Date("2026-08-30T08:05:00.000Z"),
    });
  });

  it("encodes Unicode and header-sensitive file names safely", () => {
    expect(attachmentContentDisposition('報告 "final".pdf')).toBe(
      "attachment; filename=\"__ _final_.pdf\"; filename*=UTF-8''%E5%A0%B1%E5%91%8A%20%22final%22.pdf",
    );
    expect(attachmentContentDisposition("it's ready.txt")).toContain(
      "filename*=UTF-8''it%27s%20ready.txt",
    );
  });

  it("generates an R2 SigV4 GET URL locally without exposing the secret", async () => {
    const provider = new CloudflareR2DownloadUrlProvider(configuration, {
      clock: () => now,
    });

    const authorization = await provider.createDownloadUrl(downloadInput);
    const url = new URL(authorization.url);

    expect(url.protocol).toBe("https:");
    expect(url.hostname).toContain(
      "0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com",
    );
    expect(decodeURIComponent(url.pathname)).toContain(objectKey);
    expect(url.searchParams.get("X-Amz-Expires")).toBe("300");
    expect(url.searchParams.get("response-content-disposition")).toContain(
      "attachment",
    );
    expect(authorization.url).not.toContain(configuration.secretAccessKey);
  });

  it.each([
    { ...downloadInput, objectKey: "objects/private-plan.pdf" },
    { ...downloadInput, originalName: "unsafe\r\nheader.txt" },
    { ...downloadInput, originalName: "../private.txt" },
    { ...downloadInput, expiresInSeconds: 301 },
  ])("rejects an unsafe request before signing", async (unsafeInput) => {
    const presignDownload = vi.fn();
    const provider = new CloudflareR2DownloadUrlProvider(configuration, {
      presignDownload,
    });

    await expect(provider.createDownloadUrl(unsafeInput)).rejects.toThrowError(
      R2DownloadRequestError,
    );
    expect(presignDownload).not.toHaveBeenCalled();
  });
});
