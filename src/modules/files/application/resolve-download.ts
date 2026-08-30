import type { FileRepository } from "./ports/file-repository";
import {
  DOWNLOAD_URL_TTL_SECONDS,
  type DownloadAuthorization,
  type DownloadUrlProvider,
} from "./ports/download-url-provider";
import { hashShareToken, isShareToken } from "../domain/share-token";

export type DownloadResolutionErrorCode =
  "DOWNLOAD_NOT_FOUND" | "DOWNLOAD_EXPIRED" | "INVALID_DOWNLOAD_AUTHORIZATION";

export class DownloadResolutionError extends Error {
  constructor(readonly code: DownloadResolutionErrorCode) {
    super(code);
    this.name = "DownloadResolutionError";
  }
}

export interface ResolveDownloadDependencies {
  fileRepository: FileRepository;
  downloadUrlProvider: DownloadUrlProvider;
  clock?: () => Date;
}

export interface ResolveDownloadResult {
  url: string;
  expiresAt: Date;
}

function validateAuthorization(
  authorization: DownloadAuthorization,
  now: Date,
  fileExpiresAt: Date,
  requestedTtlSeconds: number,
): ResolveDownloadResult {
  let url: URL;

  try {
    url = new URL(authorization.url);
  } catch {
    throw new DownloadResolutionError("INVALID_DOWNLOAD_AUTHORIZATION");
  }

  const latestRequestedExpiry = new Date(
    now.getTime() + requestedTtlSeconds * 1_000,
  );

  if (
    url.protocol !== "https:" ||
    url.username !== "" ||
    url.password !== "" ||
    !Number.isFinite(authorization.expiresAt.getTime()) ||
    authorization.expiresAt <= now ||
    authorization.expiresAt > latestRequestedExpiry ||
    authorization.expiresAt > fileExpiresAt
  ) {
    throw new DownloadResolutionError("INVALID_DOWNLOAD_AUTHORIZATION");
  }

  return {
    url: url.toString(),
    expiresAt: new Date(authorization.expiresAt),
  };
}

export function createResolveDownload({
  fileRepository,
  downloadUrlProvider,
  clock = () => new Date(),
}: ResolveDownloadDependencies) {
  return async function resolveDownload(
    shareToken: string,
  ): Promise<ResolveDownloadResult> {
    if (!isShareToken(shareToken)) {
      throw new DownloadResolutionError("DOWNLOAD_NOT_FOUND");
    }

    const file = await fileRepository.findByShareTokenHash(
      hashShareToken(shareToken),
    );

    if (!file || file.status !== "READY") {
      throw new DownloadResolutionError("DOWNLOAD_NOT_FOUND");
    }

    const now = clock();

    if (!Number.isFinite(now.getTime())) {
      throw new TypeError("Cannot resolve a download with an invalid clock");
    }

    const remainingWholeSeconds = Math.floor(
      (file.expiresAt.getTime() - now.getTime()) / 1_000,
    );

    // Leave one second of safety so a presigned URL never outlives FileDrop's
    // own expiry when signing takes a fraction of a second.
    if (remainingWholeSeconds < 2) {
      throw new DownloadResolutionError("DOWNLOAD_EXPIRED");
    }

    const requestedTtlSeconds = Math.min(
      DOWNLOAD_URL_TTL_SECONDS,
      remainingWholeSeconds - 1,
    );
    const authorization = await downloadUrlProvider.createDownloadUrl({
      objectKey: file.objectKey,
      originalName: file.originalName,
      expiresInSeconds: requestedTtlSeconds,
    });
    const validatedAt = clock();

    if (!Number.isFinite(validatedAt.getTime())) {
      throw new TypeError("Cannot validate a download with an invalid clock");
    }

    return validateAuthorization(
      authorization,
      validatedAt,
      file.expiresAt,
      requestedTtlSeconds,
    );
  };
}
