import { describe, expect, it } from "vitest";

import { initializeUploadRequestSchema } from "./initialize-upload-contract";

const validRequest = {
  originalName: "architecture.pdf",
  contentType: "application/pdf",
  sizeBytes: 42,
  expirationSeconds: 86_400,
};

describe("initializeUploadRequestSchema", () => {
  it("accepts the expected HTTP request shape", () => {
    expect(initializeUploadRequestSchema.safeParse(validRequest).success).toBe(
      true,
    );
  });

  it("rejects unexpected properties instead of silently accepting them", () => {
    expect(
      initializeUploadRequestSchema.safeParse({
        ...validRequest,
        isOwner: true,
      }).success,
    ).toBe(false);
  });

  it.each([
    { ...validRequest, sizeBytes: 3_000_000_001 },
    { ...validRequest, sizeBytes: 1.5 },
    { ...validRequest, expirationSeconds: 60 },
    { ...validRequest, contentType: "a".repeat(256) },
  ])("rejects an invalid request", (request) => {
    expect(initializeUploadRequestSchema.safeParse(request).success).toBe(
      false,
    );
  });
});
