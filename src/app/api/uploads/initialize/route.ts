import type { NextRequest } from "next/server";
import { observeRequest } from "../../../../lib/operations/logger";

import { withOwnerUploadHttpHandlers } from "../../../../modules/files/infrastructure/owner-upload-composition";

export const runtime = "nodejs";

export function POST(request: NextRequest) {
  return observeRequest("upload.initialize", () =>
    withOwnerUploadHttpHandlers((handlers) => handlers.initialize(request)),
  );
}
