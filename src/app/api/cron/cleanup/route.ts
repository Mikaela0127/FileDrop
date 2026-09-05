import { handleScheduledCleanup } from "../../../../modules/files/infrastructure/scheduled-cleanup-composition";

import { observeRequest } from "../../../../lib/operations/logger";
export const runtime = "nodejs";

export function GET(request: Request) {
  return observeRequest("cleanup.run", () => handleScheduledCleanup(request));
}
