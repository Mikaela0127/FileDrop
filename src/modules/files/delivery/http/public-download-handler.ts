import { NextResponse } from "next/server";

import { DownloadResolutionError } from "../../application/resolve-download";
import type { ResolveDownloadResult } from "../../application/resolve-download";

type ResolveDownload = (shareToken: string) => Promise<ResolveDownloadResult>;

const RESPONSE_SECURITY_HEADERS = {
  "Cache-Control": "no-store",
  Pragma: "no-cache",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
} as const;

function unavailableResponse(message: string, status: number): NextResponse {
  return new NextResponse(message, {
    status,
    headers: {
      ...RESPONSE_SECURITY_HEADERS,
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}

export function downloadUnavailableResponse(): NextResponse {
  return unavailableResponse(
    "FileDrop cannot prepare this download right now. Try again later.",
    503,
  );
}

export function createPublicDownloadHandler(resolveDownload: ResolveDownload) {
  return async function publicDownload(
    shareToken: string,
  ): Promise<NextResponse> {
    try {
      const result = await resolveDownload(shareToken);
      const response = NextResponse.redirect(result.url, 307);

      for (const [name, value] of Object.entries(RESPONSE_SECURITY_HEADERS)) {
        response.headers.set(name, value);
      }

      return response;
    } catch (error) {
      if (error instanceof DownloadResolutionError) {
        if (error.code === "DOWNLOAD_EXPIRED") {
          return unavailableResponse("This FileDrop link has expired.", 410);
        }

        if (error.code === "DOWNLOAD_NOT_FOUND") {
          return unavailableResponse(
            "This FileDrop link is invalid or unavailable.",
            404,
          );
        }
      }

      return downloadUnavailableResponse();
    }
  };
}
