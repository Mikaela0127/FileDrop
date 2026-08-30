import "server-only";

import type { NextResponse } from "next/server";

import {
  CleanupConfigurationError,
  requireCleanupConfig,
} from "../../../lib/config/cleanup-config";
import { getServerEnv } from "../../../lib/config/server-env";
import { prisma } from "../../../lib/database/prisma";
import { createCleanupExpiredFiles } from "../application/cleanup-expired-files";
import {
  createScheduledCleanupHandler,
  scheduledCleanupUnavailableResponse,
} from "../delivery/http/scheduled-cleanup-handler";
import { PrismaFileRepository } from "./persistence/prisma-file-repository";
import { getR2ObjectStore } from "./storage/r2-object-store";

type ScheduledCleanupHandler = (request: Request) => Promise<NextResponse>;
type CleanupExpiredFiles = ReturnType<typeof createCleanupExpiredFiles>;

let scheduledCleanupHandler: ScheduledCleanupHandler | undefined;
let cleanupExpiredFiles: CleanupExpiredFiles | undefined;

function runCleanup() {
  if (!cleanupExpiredFiles) {
    cleanupExpiredFiles = createCleanupExpiredFiles({
      fileCleanupRepository: new PrismaFileRepository(prisma),
      objectStore: getR2ObjectStore(),
    });
  }

  return cleanupExpiredFiles();
}

export async function handleScheduledCleanup(
  request: Request,
): Promise<NextResponse> {
  try {
    if (!scheduledCleanupHandler) {
      const { cronSecret } = requireCleanupConfig(getServerEnv());
      scheduledCleanupHandler = createScheduledCleanupHandler({
        cronSecret,
        cleanupExpiredFiles: runCleanup,
      });
    }

    return await scheduledCleanupHandler(request);
  } catch (error) {
    if (error instanceof CleanupConfigurationError) {
      return scheduledCleanupUnavailableResponse();
    }

    throw error;
  }
}
