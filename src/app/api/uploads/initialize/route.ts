import type { NextRequest } from "next/server";

import { withOwnerUploadHttpHandlers } from "../../../../modules/files/infrastructure/owner-upload-composition";

export const runtime = "nodejs";

export function POST(request: NextRequest) {
  return withOwnerUploadHttpHandlers((handlers) =>
    handlers.initialize(request),
  );
}
