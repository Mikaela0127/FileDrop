import type { NextRequest } from "next/server";

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
  return withOwnerUploadHttpHandlers((handlers) =>
    handlers.complete(request, fileId),
  );
}
