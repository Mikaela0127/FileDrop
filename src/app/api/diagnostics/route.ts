import type { NextRequest } from "next/server";
import { withOwnerAuthContext } from "../../../modules/auth/infrastructure/owner-auth-composition";
import { createClientDiagnosticsHandler } from "../../../modules/files/delivery/http/client-diagnostics-handler";
import { observeRequest } from "../../../lib/operations/logger";

export const runtime = "nodejs";
let handler: ReturnType<typeof createClientDiagnosticsHandler> | undefined;
export function POST(request: NextRequest) {
  return observeRequest("client.error", () =>
    withOwnerAuthContext(async (context) => {
      handler ??= createClientDiagnosticsHandler(context);
      return handler(request);
    }),
  );
}
