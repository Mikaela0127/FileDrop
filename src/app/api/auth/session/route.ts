import type { NextRequest } from "next/server";

import { withOwnerAuthHttpHandlers } from "../../../../modules/auth/infrastructure/owner-auth-composition";

import { observeRequest } from "../../../../lib/operations/logger";
export const runtime = "nodejs";

export function GET(request: NextRequest) {
  return observeRequest("auth.session", () =>
    withOwnerAuthHttpHandlers((handlers) => handlers.session(request)),
  );
}
