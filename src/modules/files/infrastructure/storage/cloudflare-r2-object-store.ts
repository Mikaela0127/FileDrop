import {
  DeleteObjectCommand,
  HeadObjectCommand,
  S3Client,
  type HeadObjectCommandOutput,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";

import type { R2StorageConfig } from "../../../../lib/config/r2-storage-config";
import type {
  ObjectStore,
  StoredObjectMetadata,
} from "../../application/ports/object-store";
import { isObjectKey } from "../../domain/object-key";

type SendCommand = (
  command: HeadObjectCommand | DeleteObjectCommand,
) => Promise<HeadObjectCommandOutput | object>;

export interface CloudflareR2ObjectStoreDependencies {
  createClient?: (configuration: S3ClientConfig) => S3Client;
  sendCommand?: SendCommand;
}

export class R2ObjectStoreRequestError extends Error {
  constructor() {
    super("Invalid R2 object store request");
    this.name = "R2ObjectStoreRequestError";
  }
}

export class R2ObjectMetadataError extends Error {
  constructor() {
    super("R2 returned invalid object metadata");
    this.name = "R2ObjectMetadataError";
  }
}

function isNotFoundError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const providerError = error as {
    $metadata?: { httpStatusCode?: number };
    name?: string;
  };

  return (
    providerError.$metadata?.httpStatusCode === 404 ||
    providerError.name === "NotFound" ||
    providerError.name === "NoSuchKey"
  );
}

export class CloudflareR2ObjectStore implements ObjectStore {
  private readonly bucketName: string;
  private readonly sendCommand: SendCommand;

  constructor(
    configuration: R2StorageConfig,
    dependencies: CloudflareR2ObjectStoreDependencies = {},
  ) {
    this.bucketName = configuration.bucketName;
    const client = (
      dependencies.createClient ?? ((config) => new S3Client(config))
    )({
      region: "auto",
      endpoint: `https://${configuration.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: configuration.accessKeyId,
        secretAccessKey: configuration.secretAccessKey,
      },
    });
    this.sendCommand =
      dependencies.sendCommand ?? ((command) => client.send(command));
  }

  async inspectObject(objectKey: string): Promise<StoredObjectMetadata | null> {
    this.assertObjectKey(objectKey);

    let output: HeadObjectCommandOutput;

    try {
      output = (await this.sendCommand(
        new HeadObjectCommand({
          Bucket: this.bucketName,
          Key: objectKey,
        }),
      )) as HeadObjectCommandOutput;
    } catch (error) {
      if (isNotFoundError(error)) {
        return null;
      }

      throw error;
    }

    if (
      !Number.isSafeInteger(output.ContentLength) ||
      output.ContentLength === undefined ||
      output.ContentLength < 0 ||
      typeof output.ContentType !== "string" ||
      output.ContentType.length === 0
    ) {
      throw new R2ObjectMetadataError();
    }

    return {
      contentType: output.ContentType,
      sizeBytes: output.ContentLength,
    };
  }

  async deleteObject(objectKey: string): Promise<void> {
    this.assertObjectKey(objectKey);
    await this.sendCommand(
      new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: objectKey,
      }),
    );
  }

  private assertObjectKey(objectKey: string): void {
    if (!isObjectKey(objectKey)) {
      throw new R2ObjectStoreRequestError();
    }
  }
}
