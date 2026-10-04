export const MAX_FILE_SIZE_BYTES = 3_000_000_000;
export const MAX_FILE_SIZE_LABEL = "3 GB";

export const EXPIRATION_OPTIONS = [
  { label: "1 hour", seconds: 60 * 60 },
  { label: "24 hours", seconds: 24 * 60 * 60 },
  { label: "3 days", seconds: 3 * 24 * 60 * 60 },
  { label: "7 days", seconds: 7 * 24 * 60 * 60 },
] as const;

// A PENDING upload this old is abandoned and reconciled with storage (ADR 0019).
// It must stay well above the upload grant plus deletion lease, so that only an
// unusually slow transfer can still be running when it is reconciled.
export const ABANDONED_UPLOAD_MILLISECONDS = 6 * 60 * 60 * 1_000;

export function isAbandonedUpload(createdAt: Date, now: Date): boolean {
  return now.getTime() - createdAt.getTime() >= ABANDONED_UPLOAD_MILLISECONDS;
}

export function isAllowedFileSize(sizeBytes: number): boolean {
  return (
    Number.isSafeInteger(sizeBytes) &&
    sizeBytes > 0 &&
    sizeBytes <= MAX_FILE_SIZE_BYTES
  );
}

export function isAllowedExpirationSeconds(expirationSeconds: number): boolean {
  return EXPIRATION_OPTIONS.some(
    (option) => option.seconds === expirationSeconds,
  );
}
