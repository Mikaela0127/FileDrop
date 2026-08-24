import type { FileRepository } from "./ports/file-repository";
import {
  UPLOAD_URL_TTL_SECONDS,
  type UploadAuthorization,
  type UploadUrlProvider,
} from "./ports/upload-url-provider";
import { generateObjectKey } from "../domain/object-key";
import { generateShareToken, hashShareToken } from "../domain/share-token";
import {
  type UploadMetadataInput,
  validateUploadMetadata,
} from "../domain/upload-metadata";

export type UploadInitializationErrorCode = "INVALID_UPLOAD_AUTHORIZATION";

export class UploadInitializationError extends Error {
  constructor(readonly code: UploadInitializationErrorCode) {
    super(code);
    this.name = "UploadInitializationError";
  }
}

export interface InitializeUploadDependencies {
  fileRepository: FileRepository;
  uploadUrlProvider: UploadUrlProvider;
  clock?: () => Date;
  createObjectKey?: () => string;
  createShareToken?: () => string;
}

export interface InitializeUploadResult {
  fileId: string;
  shareToken: string;
  fileExpiresAt: Date;
  upload: UploadAuthorization;
}

function validateUploadAuthorization(
  authorization: UploadAuthorization,
  now: Date,
): UploadAuthorization {
  let uploadUrl: URL;

  try {
    uploadUrl = new URL(authorization.url);
  } catch {
    throw new UploadInitializationError("INVALID_UPLOAD_AUTHORIZATION");
  }

  const latestAllowedExpiry = new Date(
    now.getTime() + UPLOAD_URL_TTL_SECONDS * 1_000,
  );

  if (
    authorization.method !== "PUT" ||
    uploadUrl.protocol !== "https:" ||
    uploadUrl.username !== "" ||
    uploadUrl.password !== "" ||
    !Number.isFinite(authorization.expiresAt.getTime()) ||
    authorization.expiresAt <= now ||
    authorization.expiresAt > latestAllowedExpiry
  ) {
    throw new UploadInitializationError("INVALID_UPLOAD_AUTHORIZATION");
  }

  return {
    ...authorization,
    url: uploadUrl.toString(),
    headers: { ...authorization.headers },
    expiresAt: new Date(authorization.expiresAt),
  };
}

export function createInitializeUpload({
  fileRepository,
  uploadUrlProvider,
  clock = () => new Date(),
  createObjectKey = generateObjectKey,
  createShareToken = generateShareToken,
}: InitializeUploadDependencies) {
  return async function initializeUpload(
    input: UploadMetadataInput,
  ): Promise<InitializeUploadResult> {
    const metadata = validateUploadMetadata(input);
    const now = clock();
    const objectKey = createObjectKey();
    const shareToken = createShareToken();
    const shareTokenHash = hashShareToken(shareToken);
    const fileExpiresAt = new Date(
      now.getTime() + metadata.expirationSeconds * 1_000,
    );

    const upload = validateUploadAuthorization(
      await uploadUrlProvider.createUploadUrl({
        objectKey,
        contentType: metadata.contentType,
        sizeBytes: metadata.sizeBytes,
        expiresInSeconds: UPLOAD_URL_TTL_SECONDS,
      }),
      now,
    );

    const file = await fileRepository.create({
      shareTokenHash,
      objectKey,
      originalName: metadata.originalName,
      contentType: metadata.contentType,
      sizeBytes: metadata.sizeBytes,
      status: "PENDING",
      expiresAt: fileExpiresAt,
    });

    return {
      fileId: file.id,
      shareToken,
      fileExpiresAt: new Date(file.expiresAt),
      upload,
    };
  };
}
