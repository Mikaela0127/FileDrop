import { createHash, timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import type { CleanupExpiredFilesResult } from "../../application/cleanup-expired-files";

type CleanupExpiredFiles = () => Promise<CleanupExpiredFilesResult>;

interface ScheduledCleanupHandlerDependencies {
  cleanupExpiredFiles: CleanupExpiredFiles;
  cronSecret: string;
}

const RESPONSE_HEADERS = {
  "Cache-Control": "no-store",
  Pragma: "no-cache",
  "X-Content-Type-Options": "nosniff",
} as const;

function jsonResponse(body: unknown, status = 200): NextResponse {
  const response = NextResponse.json(body, { status });

  for (const [name, value] of Object.entries(RESPONSE_HEADERS)) {
    response.headers.set(name, value);
  }

  return response;
}

function hasValidBearerToken(
  authorization: string | null,
  expectedSecret: string,
): boolean {
  const prefix = "Bearer ";

  if (!authorization?.startsWith(prefix)) {
    return false;
  }

  const suppliedTokenHash = createHash("sha256")
    .update(authorization.slice(prefix.length), "utf8")
    .digest();
  const expectedTokenHash = createHash("sha256")
    .update(expectedSecret, "utf8")
    .digest();

  return timingSafeEqual(suppliedTokenHash, expectedTokenHash);
}

export function scheduledCleanupUnavailableResponse(): NextResponse {
  const response = jsonResponse(
    { error: { code: "CLEANUP_UNAVAILABLE" } },
    503,
  );
  response.headers.set("Retry-After", "300");
  return response;
}

export function createScheduledCleanupHandler({
  cleanupExpiredFiles,
  cronSecret,
}: ScheduledCleanupHandlerDependencies) {
  return async function scheduledCleanup(
    request: Request,
  ): Promise<NextResponse> {
    if (
      !hasValidBearerToken(request.headers.get("authorization"), cronSecret)
    ) {
      const response = jsonResponse({ error: { code: "UNAUTHORIZED" } }, 401);
      response.headers.set("WWW-Authenticate", "Bearer");
      return response;
    }

    try {
      const result = await cleanupExpiredFiles();
      const status = result.failedCount > 0 ? 503 : 200;
      const response = jsonResponse(
        { success: result.failedCount === 0, ...result },
        status,
      );

      if (status === 503) {
        response.headers.set("Retry-After", "300");
      }

      return response;
    } catch {
      return scheduledCleanupUnavailableResponse();
    }
  };
}
