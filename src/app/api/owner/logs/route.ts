import type { NextRequest } from "next/server";
import { withOwnerAuthContext } from "../../../../modules/auth/infrastructure/owner-auth-composition";
import { logRepository } from "../../../../modules/logs/infrastructure/log-composition";
import { createOwnerLogsHandler } from "../../../../modules/logs/delivery/owner-logs-handler";
export const runtime = "nodejs";
export function GET(request: NextRequest) {
  return withOwnerAuthContext(({ authentication }) =>
    createOwnerLogsHandler(authentication, logRepository)(request),
  );
}
