import { type NextRequest, NextResponse } from "next/server";

import { isTrustedMutationOrigin } from "../../../../lib/http/same-origin";
import type { OwnerAuthentication } from "../../../auth/application/owner-authentication";
import { OWNER_SESSION_COOKIE_NAME } from "../../../auth/delivery/http/owner-auth-handlers";
import {
  UploadCompletionError,
  type CompleteUploadResult,
} from "../../application/complete-upload";
import type { InitializeUploadResult } from "../../application/initialize-upload";
import {
  UploadMetadataValidationError,
  type UploadMetadataInput,
} from "../../domain/upload-metadata";
import {
  InvalidCompleteUploadRequestError,
  parseCompleteUploadFileId,
} from "./complete-upload-contract";
import {
  InvalidInitializeUploadRequestError,
  parseInitializeUploadRequest,
} from "./initialize-upload-contract";

type InitializeUpload = (
  input: UploadMetadataInput,
) => Promise<InitializeUploadResult>;
type CompleteUpload = (fileId: string) => Promise<CompleteUploadResult>;

export interface OwnerUploadHttpHandlersDependencies {
  appOrigin: string;
  authentication: OwnerAuthentication;
  completeUpload: CompleteUpload;
  initializeUpload: InitializeUpload;
}

export interface OwnerUploadHttpHandlers {
  complete(request: NextRequest, fileId: string): Promise<NextResponse>;
  initialize(request: NextRequest): Promise<NextResponse>;
}

function jsonResponse(body: unknown, status = 200): NextResponse {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
}

function errorResponse(code: string, status: number): NextResponse {
  return jsonResponse({ error: { code } }, status);
}

async function authorizeOwnerMutation(
  request: NextRequest,
  appOrigin: string,
  authentication: OwnerAuthentication,
): Promise<NextResponse | undefined> {
  if (!isTrustedMutationOrigin(request, appOrigin)) {
    return errorResponse("FORBIDDEN_ORIGIN", 403);
  }

  const token = request.cookies.get(OWNER_SESSION_COOKIE_NAME)?.value;

  if (!(await authentication.isAuthenticated(token))) {
    return errorResponse("UNAUTHENTICATED", 401);
  }

  return undefined;
}

function completionErrorResponse(error: UploadCompletionError): NextResponse {
  switch (error.code) {
    case "UPLOAD_NOT_FOUND":
      return errorResponse("UPLOAD_NOT_FOUND", 404);
    case "OBJECT_NOT_FOUND":
      return errorResponse("OBJECT_NOT_FOUND", 409);
    case "OBJECT_MISMATCH":
      return errorResponse("OBJECT_MISMATCH", 422);
    case "UPLOAD_EXPIRED":
      return errorResponse("UPLOAD_EXPIRED", 410);
    case "UPLOAD_NOT_COMPLETABLE":
      return errorResponse("UPLOAD_NOT_COMPLETABLE", 409);
  }
}

export function ownerUploadUnavailableResponse(): NextResponse {
  return errorResponse("UPLOAD_UNAVAILABLE", 503);
}

export function createOwnerUploadHttpHandlers({
  appOrigin,
  authentication,
  completeUpload,
  initializeUpload,
}: OwnerUploadHttpHandlersDependencies): OwnerUploadHttpHandlers {
  return {
    async initialize(request) {
      const unauthorizedResponse = await authorizeOwnerMutation(
        request,
        appOrigin,
        authentication,
      );

      if (unauthorizedResponse) {
        return unauthorizedResponse;
      }

      try {
        const input = await parseInitializeUploadRequest(request);
        const result = await initializeUpload(input);

        return jsonResponse({
          fileId: result.fileId,
          shareToken: result.shareToken,
          fileExpiresAt: result.fileExpiresAt.toISOString(),
          upload: {
            ...result.upload,
            expiresAt: result.upload.expiresAt.toISOString(),
          },
        });
      } catch (error) {
        if (
          error instanceof InvalidInitializeUploadRequestError ||
          error instanceof UploadMetadataValidationError
        ) {
          return errorResponse("INVALID_UPLOAD", 400);
        }

        return ownerUploadUnavailableResponse();
      }
    },

    async complete(request, fileId) {
      const unauthorizedResponse = await authorizeOwnerMutation(
        request,
        appOrigin,
        authentication,
      );

      if (unauthorizedResponse) {
        return unauthorizedResponse;
      }

      try {
        const result = await completeUpload(parseCompleteUploadFileId(fileId));
        return jsonResponse({
          ...result,
          expiresAt: result.expiresAt.toISOString(),
          uploadedAt: result.uploadedAt.toISOString(),
        });
      } catch (error) {
        if (error instanceof InvalidCompleteUploadRequestError) {
          return errorResponse("INVALID_REQUEST", 400);
        }

        if (error instanceof UploadCompletionError) {
          return completionErrorResponse(error);
        }

        return ownerUploadUnavailableResponse();
      }
    },
  };
}
