import { describe, expect, it } from "vitest";

import { MAX_FILE_SIZE_BYTES } from "./file-policy";
import {
  UploadMetadataValidationError,
  validateUploadMetadata,
} from "./upload-metadata";

const validInput = {
  originalName: "architecture.pdf",
  contentType: "application/pdf",
  sizeBytes: MAX_FILE_SIZE_BYTES,
  expirationSeconds: 86_400,
};

describe("validateUploadMetadata", () => {
  it("normalizes safe user-controlled metadata", () => {
    expect(
      validateUploadMetadata({
        ...validInput,
        originalName: "  résumé.pdf  ",
        contentType: " APPLICATION/PDF ",
      }),
    ).toEqual({
      ...validInput,
      originalName: "résumé.pdf",
    });
  });

  it("uses a safe fallback when the browser omits a MIME type", () => {
    expect(
      validateUploadMetadata({ ...validInput, contentType: "" }).contentType,
    ).toBe("application/octet-stream");
  });

  it.each([
    "",
    ".",
    "..",
    "../secret.txt",
    "folder\\secret.txt",
    "report\u0000.pdf",
    "safe\u202Efdp.exe",
    "界".repeat(86),
  ])("rejects unsafe file name metadata", (originalName) => {
    expect(() =>
      validateUploadMetadata({ ...validInput, originalName }),
    ).toThrowError(
      expect.objectContaining<Partial<UploadMetadataValidationError>>({
        code: "INVALID_FILE_NAME",
      }),
    );
  });

  it.each(["text/plain; charset=utf-8", "not-a-mime-type", "text/pla in"])(
    "rejects invalid MIME metadata %s",
    (contentType) => {
      expect(() =>
        validateUploadMetadata({ ...validInput, contentType }),
      ).toThrowError(
        expect.objectContaining<Partial<UploadMetadataValidationError>>({
          code: "INVALID_CONTENT_TYPE",
        }),
      );
    },
  );

  it.each([0, MAX_FILE_SIZE_BYTES + 1, 1.5])(
    "rejects invalid file size %s",
    (sizeBytes) => {
      expect(() =>
        validateUploadMetadata({ ...validInput, sizeBytes }),
      ).toThrowError(
        expect.objectContaining<Partial<UploadMetadataValidationError>>({
          code: "INVALID_FILE_SIZE",
        }),
      );
    },
  );

  it("only accepts configured expiration choices", () => {
    expect(() =>
      validateUploadMetadata({ ...validInput, expirationSeconds: 60 }),
    ).toThrowError(
      expect.objectContaining<Partial<UploadMetadataValidationError>>({
        code: "INVALID_EXPIRATION",
      }),
    );
  });
});
