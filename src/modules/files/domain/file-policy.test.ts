import { describe, expect, it } from "vitest";

import {
  EXPIRATION_OPTIONS,
  isAllowedExpirationSeconds,
  isAllowedFileSize,
  MAX_FILE_SIZE_BYTES,
} from "./file-policy";

describe("file policy", () => {
  it("accepts a file at the 3 GB boundary", () => {
    expect(isAllowedFileSize(MAX_FILE_SIZE_BYTES)).toBe(true);
  });

  it.each([0, -1, MAX_FILE_SIZE_BYTES + 1, 1.5, Number.NaN])(
    "rejects invalid size %s",
    (sizeBytes) => {
      expect(isAllowedFileSize(sizeBytes)).toBe(false);
    },
  );

  it("offers expiry choices from one hour through seven days", () => {
    expect(EXPIRATION_OPTIONS.map(({ seconds }) => seconds)).toEqual([
      3_600, 86_400, 259_200, 604_800,
    ]);
  });

  it.each([3_600, 86_400, 259_200, 604_800])(
    "accepts configured expiration %s",
    (expirationSeconds) => {
      expect(isAllowedExpirationSeconds(expirationSeconds)).toBe(true);
    },
  );

  it.each([60, 3_601, 604_801, Number.NaN])(
    "rejects unconfigured expiration %s",
    (expirationSeconds) => {
      expect(isAllowedExpirationSeconds(expirationSeconds)).toBe(false);
    },
  );
});
