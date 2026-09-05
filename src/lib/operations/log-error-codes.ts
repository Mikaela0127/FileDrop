// Only fixed provider/runtime codes are eligible for diagnostic output.
export const LOG_ERROR_CODES = [
  "TYPE_ERROR",
  "RANGE_ERROR",
  "OPERATION_FAILED",
  "ECONNREFUSED",
  "ECONNRESET",
  "ENOTFOUND",
  "ETIMEDOUT",
  "P1001",
  "P1002",
  "P2002",
  "P2021",
  "P2022",
  "P2024",
  "P2025",
  "AccessDenied",
  "NoSuchKey",
  "SignatureDoesNotMatch",
  "CredentialsProviderError",
  "TimeoutError",
] as const;

export function classifyLogError(
  error: unknown,
): (typeof LOG_ERROR_CODES)[number] {
  if (error && typeof error === "object") {
    for (const candidate of [
      "code" in error ? error.code : undefined,
      "name" in error ? error.name : undefined,
    ]) {
      const known = LOG_ERROR_CODES.find((code) => code === candidate);
      if (known) return known;
    }
  }
  return error instanceof TypeError
    ? "TYPE_ERROR"
    : error instanceof RangeError
      ? "RANGE_ERROR"
      : "OPERATION_FAILED";
}
