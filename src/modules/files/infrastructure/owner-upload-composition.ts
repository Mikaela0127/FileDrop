import "server-only";

import type { NextResponse } from "next/server";

import { R2StorageConfigurationError } from "../../../lib/config/r2-storage-config";
import { prisma } from "../../../lib/database/prisma";
import { withOwnerAuthContext } from "../../auth/infrastructure/owner-auth-composition";
import { createCompleteUpload } from "../application/complete-upload";
import { createInitializeUpload } from "../application/initialize-upload";
import {
  createOwnerUploadHttpHandlers,
  ownerUploadUnavailableResponse,
  type OwnerUploadHttpHandlers,
} from "../delivery/http/owner-upload-handlers";
import { PrismaFileRepository } from "./persistence/prisma-file-repository";
import { getR2ObjectStore } from "./storage/r2-object-store";
import { getR2UploadUrlProvider } from "./storage/r2-upload-url-provider";

let ownerUploadHttpHandlers: OwnerUploadHttpHandlers | undefined;

export function withOwnerUploadHttpHandlers(
  handler: (handlers: OwnerUploadHttpHandlers) => Promise<NextResponse>,
): Promise<NextResponse> {
  return withOwnerAuthContext(async ({ appOrigin, authentication }) => {
    try {
      if (!ownerUploadHttpHandlers) {
        const fileRepository = new PrismaFileRepository(prisma);
        ownerUploadHttpHandlers = createOwnerUploadHttpHandlers({
          appOrigin,
          authentication,
          initializeUpload: createInitializeUpload({
            fileRepository,
            uploadUrlProvider: getR2UploadUrlProvider(),
          }),
          completeUpload: createCompleteUpload({
            fileRepository,
            objectStore: getR2ObjectStore(),
          }),
        });
      }

      return await handler(ownerUploadHttpHandlers);
    } catch (error) {
      if (error instanceof R2StorageConfigurationError) {
        return ownerUploadUnavailableResponse();
      }

      throw error;
    }
  });
}
