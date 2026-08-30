import { handleScheduledCleanup } from "../../../../modules/files/infrastructure/scheduled-cleanup-composition";

export const runtime = "nodejs";

export function GET(request: Request) {
  return handleScheduledCleanup(request);
}
