import { type NextRequest, NextResponse } from "next/server";

import type { OwnerAuthentication } from "../../../auth/application/owner-authentication";
import { OWNER_SESSION_COOKIE_NAME } from "../../../auth/delivery/http/owner-auth-handlers";
import type { ListOwnerFilesResult } from "../../application/list-owner-files";

type ListOwnerFiles = () => Promise<ListOwnerFilesResult>;

export interface OwnerFileCatalogHttpHandlerDependencies {
  authentication: OwnerAuthentication;
  listOwnerFiles: ListOwnerFiles;
}

export interface OwnerFileCatalogHttpHandler {
  list(request: NextRequest): Promise<NextResponse>;
}

function jsonResponse(body: unknown, status = 200): NextResponse {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("Vary", "Cookie");
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
}

function errorResponse(code: string, status: number): NextResponse {
  return jsonResponse({ error: { code } }, status);
}

export function ownerFileCatalogUnavailableResponse(): NextResponse {
  return errorResponse("FILES_UNAVAILABLE", 503);
}

export function createOwnerFileCatalogHttpHandler({
  authentication,
  listOwnerFiles,
}: OwnerFileCatalogHttpHandlerDependencies): OwnerFileCatalogHttpHandler {
  return {
    async list(request) {
      try {
        const token = request.cookies.get(OWNER_SESSION_COOKIE_NAME)?.value;

        if (!(await authentication.isAuthenticated(token))) {
          return errorResponse("UNAUTHENTICATED", 401);
        }

        const result = await listOwnerFiles();
        return jsonResponse({
          limit: result.limit,
          files: result.files.map((file) => ({
            ...file,
            expiresAt: file.expiresAt.toISOString(),
            lastDownloadedAt: file.lastDownloadedAt?.toISOString() ?? null,
            createdAt: file.createdAt.toISOString(),
          })),
        });
      } catch {
        return ownerFileCatalogUnavailableResponse();
      }
    },
  };
}
