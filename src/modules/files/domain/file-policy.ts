export const MAX_FILE_SIZE_BYTES = 3_000_000_000;
export const MAX_FILE_SIZE_LABEL = "3 GB";

export const EXPIRATION_OPTIONS = [
  { label: "1 hour", seconds: 60 * 60 },
  { label: "24 hours", seconds: 24 * 60 * 60 },
  { label: "3 days", seconds: 3 * 24 * 60 * 60 },
  { label: "7 days", seconds: 7 * 24 * 60 * 60 },
] as const;

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
