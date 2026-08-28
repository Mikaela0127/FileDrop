import {
  DeleteObjectCommand,
  HeadObjectCommand,
  S3Client,
  type HeadObjectCommandOutput,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";
import { describe, expect, it, vi } from "vitest";

import type { R2StorageConfig } from "../../../../lib/config/r2-storage-config";
import {
  CloudflareR2ObjectStore,
  R2ObjectMetadataError,
  R2ObjectStoreRequestError,
} from "./cloudflare-r2-object-store";

const objectKey = "objects/123e4567-e89b-42d3-a456-426614174000";
const configuration: R2StorageConfig = {
  accountId: "0123456789abcdef0123456789abcdef",
  accessKeyId: "example-access-key-id",
  secretAccessKey: "example-secret-key-not-a-real-credential",
  bucketName: "filedrop-test",
};

describe("CloudflareR2ObjectStore", () => {
  it("reads trusted metadata with a scoped HEAD request", async () => {
    const createClient = vi.fn(
      (clientConfiguration: S3ClientConfig) =>
        new S3Client(clientConfiguration),
    );
    const sendCommand = vi.fn(
      async (
        _command: HeadObjectCommand | DeleteObjectCommand,
      ): Promise<HeadObjectCommandOutput> => {
        void _command;
        return {
          ContentLength: 42,
          ContentType: "application/pdf",
          $metadata: {},
        };
      },
    );
    const store = new CloudflareR2ObjectStore(configuration, {
      createClient,
      sendCommand,
    });

    await expect(store.inspectObject(objectKey)).resolves.toEqual({
      contentType: "application/pdf",
      sizeBytes: 42,
    });
    expect(createClient).toHaveBeenCalledWith({
      region: "auto",
      endpoint:
        "https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com",
      credentials: {
        accessKeyId: "example-access-key-id",
        secretAccessKey: "example-secret-key-not-a-real-credential",
      },
    });
    const [command] = sendCommand.mock.calls[0];
    expect(command).toBeInstanceOf(HeadObjectCommand);
    expect(command.input).toEqual({ Bucket: "filedrop-test", Key: objectKey });
  });

  it("deletes only a validated opaque object key", async () => {
    const sendCommand = vi.fn(
      async (_command: HeadObjectCommand | DeleteObjectCommand) => {
        void _command;
        return {};
      },
    );
    const store = new CloudflareR2ObjectStore(configuration, { sendCommand });

    await store.deleteObject(objectKey);

    const [command] = sendCommand.mock.calls[0];
    expect(command).toBeInstanceOf(DeleteObjectCommand);
    expect(command.input).toEqual({ Bucket: "filedrop-test", Key: objectKey });
  });

  it.each([
    { $metadata: { httpStatusCode: 404 } },
    { name: "NotFound" },
    { name: "NoSuchKey" },
  ])("maps provider not-found errors to a missing object", async (error) => {
    const store = new CloudflareR2ObjectStore(configuration, {
      sendCommand: vi.fn(async () => {
        throw error;
      }),
    });

    await expect(store.inspectObject(objectKey)).resolves.toBeNull();
  });

  it.each([
    { ContentLength: undefined, ContentType: "application/pdf" },
    { ContentLength: -1, ContentType: "application/pdf" },
    { ContentLength: 42, ContentType: "" },
  ])("rejects invalid provider metadata", async (metadata) => {
    const store = new CloudflareR2ObjectStore(configuration, {
      sendCommand: vi.fn(async () => ({ ...metadata, $metadata: {} })),
    });

    await expect(store.inspectObject(objectKey)).rejects.toThrowError(
      R2ObjectMetadataError,
    );
  });

  it("rejects unsafe keys before sending a request", async () => {
    const sendCommand = vi.fn(async () => ({}));
    const store = new CloudflareR2ObjectStore(configuration, { sendCommand });

    await expect(
      store.inspectObject("objects/private-plan.pdf"),
    ).rejects.toThrowError(R2ObjectStoreRequestError);
    expect(sendCommand).not.toHaveBeenCalled();
  });

  it("does not hide unexpected storage failures", async () => {
    const providerError = new Error("R2 unavailable");
    const store = new CloudflareR2ObjectStore(configuration, {
      sendCommand: vi.fn(async () => {
        throw providerError;
      }),
    });

    await expect(store.inspectObject(objectKey)).rejects.toBe(providerError);
  });
});
