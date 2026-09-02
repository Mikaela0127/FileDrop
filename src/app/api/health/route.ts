import { createHealthResponse } from "../../../lib/http/health-response";

export const runtime = "nodejs";

export function GET() {
  return createHealthResponse();
}
