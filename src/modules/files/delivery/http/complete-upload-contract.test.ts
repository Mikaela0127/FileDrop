import { describe, expect, it } from "vitest";

import {
  InvalidCompleteUploadRequestError,
  parseCompleteUploadFileId,
} from "./complete-upload-contract";

describe("parseCompleteUploadFileId", () => {
  it("accepts a UUID file identifier", () => {
    expect(
      parseCompleteUploadFileId("123e4567-e89b-42d3-a456-426614174001"),
    ).toBe("123e4567-e89b-42d3-a456-426614174001");
  });

  it.each(["", "../private-plan.pdf", "not-a-uuid"])(
    "rejects an invalid identifier",
    (fileId) => {
      expect(() => parseCompleteUploadFileId(fileId)).toThrowError(
        InvalidCompleteUploadRequestError,
      );
    },
  );
});
