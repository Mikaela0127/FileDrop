import {
  GetObjectCommand,
  S3Client,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import type { R2StorageConfig } from "../../../../lib/config/r2-storage-config";
import {
  DOWNLOAD_URL_TTL_SECONDS,
  type CreateDownloadUrlInput,
  type DownloadAuthorization,
  type DownloadUrlProvider,
} from "../../application/ports/download-url-provider";
import { isObjectKey } from "../../domain/object-key";

const MAX_FILE_NAME_BYTES = 255;
const UNSAFE_FILE_NAME_CHARACTER = /[\u0000-\u001f\u007f]/u;

interface DownloadPresigningOptions {
  expiresIn: number;
  signingDate: Date;
}

type PresignDownload = (
  client: S3Client,
  command: GetObjectCommand,
  options: DownloadPresigningOptions,
) => Promise<string>;

type CreateS3Client = (configuration: S3ClientConfig) => S3Client;

export interface CloudflareR2DownloadUrlProviderDependencies {
  clock?: () => Date;
  createClient?: CreateS3Client;
  presignDownload?: PresignDownload;
}

export class R2DownloadRequestError extends Error {
  constructor() {
    super("Invalid R2 download request");
    this.name = "R2DownloadRequestError";
  }
}

const defaultCreateClient: CreateS3Client = (configuration) =>
  new S3Client(configuration);

const defaultPresignDownload: PresignDownload = (client, command, options) =>
  getSignedUrl(client, command, options);

function validateDownloadRequest(input: CreateDownloadUrlInput): void {
  const fileNameBytes = new TextEncoder().encode(input.originalName).byteLength;

  if (
    !isObjectKey(input.objectKey) ||
    input.originalName.length === 0 ||
    fileNameBytes > MAX_FILE_NAME_BYTES ||
    input.originalName.includes("/") ||
    input.originalName.includes("\\") ||
    UNSAFE_FILE_NAME_CHARACTER.test(input.originalName) ||
    !Number.isSafeInteger(input.expiresInSeconds) ||
    input.expiresInSeconds < 1 ||
    input.expiresInSeconds > DOWNLOAD_URL_TTL_SECONDS
  ) {
    throw new R2DownloadRequestError();
  }
}

function asciiFileNameFallback(fileName: string): string {
  const fallback = fileName
    .replace(/[^\x20-\x7e]/gu, "_")
    .replace(/["\\]/gu, "_");

  return fallback.length > 0 ? fallback : "download";
}

function encodeRfc5987Value(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/gu,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

export function attachmentContentDisposition(fileName: string): string {
  return `attachment; filename="${asciiFileNameFallback(fileName)}"; filename*=UTF-8''${encodeRfc5987Value(fileName)}`;
}

export class CloudflareR2DownloadUrlProvider implements DownloadUrlProvider {
  private readonly bucketName: string;
  private readonly client: S3Client;
  private readonly clock: () => Date;
  private readonly presignDownload: PresignDownload;

  constructor(
    configuration: R2StorageConfig,
    dependencies: CloudflareR2DownloadUrlProviderDependencies = {},
  ) {
    const createClient = dependencies.createClient ?? defaultCreateClient;

    this.bucketName = configuration.bucketName;
    this.clock = dependencies.clock ?? (() => new Date());
    this.presignDownload =
      dependencies.presignDownload ?? defaultPresignDownload;
    this.client = createClient({
      region: "auto",
      endpoint: `https://${configuration.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: configuration.accessKeyId,
        secretAccessKey: configuration.secretAccessKey,
      },
    });
  }

  async createDownloadUrl(
    input: CreateDownloadUrlInput,
  ): Promise<DownloadAuthorization> {
    validateDownloadRequest(input);

    const signingDate = this.clock();
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: input.objectKey,
      ResponseContentDisposition: attachmentContentDisposition(
        input.originalName,
      ),
    });
    const url = await this.presignDownload(this.client, command, {
      expiresIn: input.expiresInSeconds,
      signingDate,
    });

    return {
      url,
      expiresAt: new Date(
        signingDate.getTime() + input.expiresInSeconds * 1_000,
      ),
    };
  }
}
