import { isAllowedExpirationSeconds, isAllowedFileSize } from "./file-policy";

const MAX_FILE_NAME_BYTES = 255;
const MAX_CONTENT_TYPE_LENGTH = 255;
const DEFAULT_CONTENT_TYPE = "application/octet-stream";

const CONTROL_OR_BIDI_CHARACTER =
  /[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u;
const MIME_TYPE = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+\/[!#$%&'*+.^_`|~0-9A-Za-z-]+$/u;

export type UploadMetadataValidationCode =
  | "INVALID_FILE_NAME"
  | "INVALID_CONTENT_TYPE"
  | "INVALID_FILE_SIZE"
  | "INVALID_EXPIRATION";

export class UploadMetadataValidationError extends Error {
  constructor(readonly code: UploadMetadataValidationCode) {
    super(code);
    this.name = "UploadMetadataValidationError";
  }
}

export interface UploadMetadataInput {
  originalName: string;
  contentType?: string;
  sizeBytes: number;
  expirationSeconds: number;
}

export interface ValidatedUploadMetadata {
  originalName: string;
  contentType: string;
  sizeBytes: number;
  expirationSeconds: number;
}

function normalizeFileName(originalName: string): string {
  const normalizedName = originalName.normalize("NFC").trim();
  const byteLength = new TextEncoder().encode(normalizedName).byteLength;

  if (
    normalizedName.length === 0 ||
    normalizedName === "." ||
    normalizedName === ".." ||
    normalizedName.includes("/") ||
    normalizedName.includes("\\") ||
    CONTROL_OR_BIDI_CHARACTER.test(normalizedName) ||
    byteLength > MAX_FILE_NAME_BYTES
  ) {
    throw new UploadMetadataValidationError("INVALID_FILE_NAME");
  }

  return normalizedName;
}

function normalizeContentType(contentType?: string): string {
  const normalizedContentType = contentType?.trim().toLowerCase();

  if (!normalizedContentType) {
    return DEFAULT_CONTENT_TYPE;
  }

  if (
    normalizedContentType.length > MAX_CONTENT_TYPE_LENGTH ||
    !MIME_TYPE.test(normalizedContentType)
  ) {
    throw new UploadMetadataValidationError("INVALID_CONTENT_TYPE");
  }

  return normalizedContentType;
}

export function validateUploadMetadata(
  input: UploadMetadataInput,
): ValidatedUploadMetadata {
  if (!isAllowedFileSize(input.sizeBytes)) {
    throw new UploadMetadataValidationError("INVALID_FILE_SIZE");
  }

  if (!isAllowedExpirationSeconds(input.expirationSeconds)) {
    throw new UploadMetadataValidationError("INVALID_EXPIRATION");
  }

  return {
    originalName: normalizeFileName(input.originalName),
    contentType: normalizeContentType(input.contentType),
    sizeBytes: input.sizeBytes,
    expirationSeconds: input.expirationSeconds,
  };
}
