import {
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import {
  UPLOAD_URL_TTL_SECONDS,
  type CreateUploadUrlInput,
  type UploadAuthorization,
  type UploadUrlProvider,
} from "../../application/ports/upload-url-provider";
import { isAllowedFileSize } from "../../domain/file-policy";
import type { R2StorageConfig } from "../../../../lib/config/r2-storage-config";
import { isObjectKey } from "../../domain/object-key";

const UNSAFE_HEADER_CHARACTER = /[\u0000-\u001f\u007f]/u;

interface UploadPresigningOptions {
  expiresIn: number;
  signingDate: Date;
  signableHeaders: Set<string>;
}

type PresignUpload = (
  client: S3Client,
  command: PutObjectCommand,
  options: UploadPresigningOptions,
) => Promise<string>;

type CreateS3Client = (configuration: S3ClientConfig) => S3Client;

export interface CloudflareR2UploadUrlProviderDependencies {
  clock?: () => Date;
  createClient?: CreateS3Client;
  presignUpload?: PresignUpload;
}

export class R2UploadRequestError extends Error {
  constructor() {
    super("Invalid R2 upload request");
    this.name = "R2UploadRequestError";
  }
}

const defaultCreateClient: CreateS3Client = (configuration) =>
  new S3Client(configuration);

const defaultPresignUpload: PresignUpload = (client, command, options) =>
  getSignedUrl(client, command, options);

function validateUploadRequest(input: CreateUploadUrlInput): void {
  if (
    !isObjectKey(input.objectKey) ||
    input.contentType.length === 0 ||
    input.contentType.length > 255 ||
    UNSAFE_HEADER_CHARACTER.test(input.contentType) ||
    !isAllowedFileSize(input.sizeBytes) ||
    !Number.isSafeInteger(input.expiresInSeconds) ||
    input.expiresInSeconds < 1 ||
    input.expiresInSeconds > UPLOAD_URL_TTL_SECONDS
  ) {
    throw new R2UploadRequestError();
  }
}

export class CloudflareR2UploadUrlProvider implements UploadUrlProvider {
  private readonly bucketName: string;
  private readonly client: S3Client;
  private readonly clock: () => Date;
  private readonly presignUpload: PresignUpload;

  constructor(
    configuration: R2StorageConfig,
    dependencies: CloudflareR2UploadUrlProviderDependencies = {},
  ) {
    const createClient = dependencies.createClient ?? defaultCreateClient;

    this.bucketName = configuration.bucketName;
    this.clock = dependencies.clock ?? (() => new Date());
    this.presignUpload = dependencies.presignUpload ?? defaultPresignUpload;
    this.client = createClient({
      region: "auto",
      endpoint: `https://${configuration.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: configuration.accessKeyId,
        secretAccessKey: configuration.secretAccessKey,
      },
    });
  }

  async createUploadUrl(
    input: CreateUploadUrlInput,
  ): Promise<UploadAuthorization> {
    validateUploadRequest(input);

    const signingDate = this.clock();
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: input.objectKey,
      ContentType: input.contentType,
      IfNoneMatch: "*",
    });
    const url = await this.presignUpload(this.client, command, {
      expiresIn: input.expiresInSeconds,
      signingDate,
      signableHeaders: new Set(["content-type", "if-none-match"]),
    });

    return {
      url,
      method: "PUT",
      headers: {
        "content-type": input.contentType,
        "if-none-match": "*",
      },
      expiresAt: new Date(
        signingDate.getTime() + input.expiresInSeconds * 1_000,
      ),
    };
  }
}
