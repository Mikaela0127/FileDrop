import "server-only";

import type { NextResponse } from "next/server";

import { R2StorageConfigurationError } from "../../../lib/config/r2-storage-config";
import { prisma } from "../../../lib/database/prisma";
import { createResolveDownload } from "../application/resolve-download";
import {
  createPublicDownloadHandler,
  downloadUnavailableResponse,
} from "../delivery/http/public-download-handler";
import { PrismaFileRepository } from "./persistence/prisma-file-repository";
import { getR2DownloadUrlProvider } from "./storage/r2-download-url-provider";

type PublicDownloadHandler = (shareToken: string) => Promise<NextResponse>;

let publicDownloadHandler: PublicDownloadHandler | undefined;

export async function handlePublicDownload(
  shareToken: string,
): Promise<NextResponse> {
  try {
    if (!publicDownloadHandler) {
      publicDownloadHandler = createPublicDownloadHandler(
        createResolveDownload({
          fileRepository: new PrismaFileRepository(prisma),
          downloadUrlProvider: getR2DownloadUrlProvider(),
        }),
      );
    }

    return await publicDownloadHandler(shareToken);
  } catch (error) {
    if (error instanceof R2StorageConfigurationError) {
      return downloadUnavailableResponse();
    }

    throw error;
  }
}
