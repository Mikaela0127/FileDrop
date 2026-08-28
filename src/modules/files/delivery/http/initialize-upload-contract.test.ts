import { describe, expect, it } from "vitest";

import {
  initializeUploadRequestSchema,
  InvalidInitializeUploadRequestError,
  parseInitializeUploadRequest,
} from "./initialize-upload-contract";

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

describe("parseInitializeUploadRequest", () => {
  function request(
    body: string,
    headers: Record<string, string> = {
      "content-type": "application/json",
    },
  ) {
    return new Request("https://filedrop.example.test/api/uploads/initialize", {
      method: "POST",
      headers,
      body,
    });
  }

  it("parses a small JSON request", async () => {
    await expect(
      parseInitializeUploadRequest(request(JSON.stringify(validRequest))),
    ).resolves.toEqual(validRequest);
  });

  it.each([
    request(JSON.stringify(validRequest), { "content-type": "text/plain" }),
    request("{"),
    request(JSON.stringify({ ...validRequest, padding: "a".repeat(4_096) })),
    request(JSON.stringify(validRequest), {
      "content-type": "application/json",
      "content-length": "999999",
    }),
  ])("rejects malformed or oversized HTTP input", async (input) => {
    await expect(parseInitializeUploadRequest(input)).rejects.toThrowError(
      InvalidInitializeUploadRequestError,
    );
  });
});
