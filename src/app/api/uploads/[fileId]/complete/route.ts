import type { NextRequest } from "next/server";
import { observeRequest } from "../../../../../lib/operations/logger";

import { withOwnerUploadHttpHandlers } from "../../../../../modules/files/infrastructure/owner-upload-composition";

export const runtime = "nodejs";

interface CompleteUploadRouteContext {
  params: Promise<{ fileId: string }>;
}

export async function POST(
  request: NextRequest,
  context: CompleteUploadRouteContext,
) {
  const { fileId } = await context.params;
  return observeRequest("upload.complete", () =>
    withOwnerUploadHttpHandlers((handlers) =>
      handlers.complete(request, fileId),
    ),
  );
}
