import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

import type { OwnerAuthentication } from "../../../auth/application/owner-authentication";
import { OWNER_SESSION_COOKIE_NAME } from "../../../auth/delivery/http/owner-auth-handlers";
import { UploadCompletionError } from "../../application/complete-upload";
import { createOwnerUploadHttpHandlers } from "./owner-upload-handlers";

const appOrigin = "https://filedrop.example.test";
const fileId = "123e4567-e89b-42d3-a456-426614174001";
const shareToken = "a".repeat(43);
const now = new Date("2026-08-28T08:00:00.000Z");
const expiresAt = new Date("2026-08-29T08:00:00.000Z");
const validUploadInput = {
  originalName: "architecture.pdf",
  contentType: "application/pdf",
  sizeBytes: 42,
  expirationSeconds: 86_400,
};
const unauthorizedCases: Array<{
  headers: Record<string, string>;
  status: number;
}> = [
  { headers: { origin: "https://attacker.example" }, status: 403 },
  { headers: { "sec-fetch-site": "cross-site" }, status: 403 },
  { headers: { cookie: "" }, status: 401 },
];

function createHarness() {
  const authentication: OwnerAuthentication = {
    authenticate: vi.fn(async () => {
      throw new Error("not used");
    }),
    isAuthenticated: vi.fn(async (token) => token === "owner-session"),
  };
  const initializeUpload = vi.fn(async () => ({
    fileId,
    shareToken,
    fileExpiresAt: expiresAt,
    upload: {
      url: "https://storage.example.test/upload?signature=redacted",
      method: "PUT" as const,
      headers: {
        "content-type": "application/pdf",
        "if-none-match": "*",
      },
      expiresAt: new Date("2026-08-28T08:15:00.000Z"),
    },
  }));
  const completeUpload = vi.fn(async () => ({
    fileId,
    status: "READY" as const,
    uploadedAt: now,
    expiresAt,
  }));
  const handlers = createOwnerUploadHttpHandlers({
    appOrigin,
    authentication,
    initializeUpload,
    completeUpload,
  });

  return { authentication, completeUpload, handlers, initializeUpload };
}

function mutationRequest(
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
) {
  return new NextRequest(`${appOrigin}${path}`, {
    method: "POST",
    headers: {
      cookie: `${OWNER_SESSION_COOKIE_NAME}=owner-session`,
      origin: appOrigin,
      "sec-fetch-site": "same-origin",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("owner upload HTTP handlers", () => {
  it("initializes a direct upload without caching sensitive authorization", async () => {
    const harness = createHarness();

    const response = await harness.handlers.initialize(
      mutationRequest("/api/uploads/initialize", validUploadInput),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      fileId,
      shareToken,
      fileExpiresAt: expiresAt.toISOString(),
      upload: {
        url: "https://storage.example.test/upload?signature=redacted",
        method: "PUT",
        headers: {
          "content-type": "application/pdf",
          "if-none-match": "*",
        },
        expiresAt: "2026-08-28T08:15:00.000Z",
      },
    });
    expect(harness.initializeUpload).toHaveBeenCalledWith(validUploadInput);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });

  it("completes an upload and returns only its public state", async () => {
    const harness = createHarness();

    const response = await harness.handlers.complete(
      mutationRequest(`/api/uploads/${fileId}/complete`),
      fileId,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      fileId,
      status: "READY",
      uploadedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    });
    expect(harness.completeUpload).toHaveBeenCalledWith(fileId);
  });

  it.each(unauthorizedCases)(
    "rejects unauthorized mutations before the use case",
    async ({ headers, status }) => {
      const harness = createHarness();

      const response = await harness.handlers.initialize(
        mutationRequest("/api/uploads/initialize", validUploadInput, headers),
      );

      expect(response.status).toBe(status);
      expect(harness.initializeUpload).not.toHaveBeenCalled();
    },
  );

  it("rejects invalid upload input without calling storage", async () => {
    const harness = createHarness();
    const response = await harness.handlers.initialize(
      mutationRequest("/api/uploads/initialize", {
        ...validUploadInput,
        sizeBytes: 3_000_000_001,
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: { code: "INVALID_UPLOAD" },
    });
    expect(harness.initializeUpload).not.toHaveBeenCalled();
  });

  it.each([
    ["UPLOAD_NOT_FOUND", 404],
    ["OBJECT_NOT_FOUND", 409],
    ["OBJECT_MISMATCH", 422],
    ["UPLOAD_EXPIRED", 410],
    ["UPLOAD_NOT_COMPLETABLE", 409],
  ] as const)("maps %s to status %s", async (code, status) => {
    const harness = createHarness();
    harness.completeUpload.mockRejectedValueOnce(
      new UploadCompletionError(code),
    );

    const response = await harness.handlers.complete(
      mutationRequest(`/api/uploads/${fileId}/complete`),
      fileId,
    );

    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toEqual({ error: { code } });
  });

  it("does not expose unexpected infrastructure errors", async () => {
    const harness = createHarness();
    harness.initializeUpload.mockRejectedValueOnce(
      new Error("secret provider detail"),
    );

    const response = await harness.handlers.initialize(
      mutationRequest("/api/uploads/initialize", validUploadInput),
    );

    expect(response.status).toBe(503);
    const body = await response.text();
    expect(body).toContain("UPLOAD_UNAVAILABLE");
    expect(body).not.toContain("secret provider detail");
  });

  it("rejects an invalid path identifier before calling the use case", async () => {
    const harness = createHarness();
    const response = await harness.handlers.complete(
      mutationRequest("/api/uploads/not-a-uuid/complete"),
      "not-a-uuid",
    );

    expect(response.status).toBe(400);
    expect(harness.completeUpload).not.toHaveBeenCalled();
  });
});
