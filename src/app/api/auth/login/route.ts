import type { NextRequest } from "next/server";

import { withOwnerAuthHttpHandlers } from "../../../../modules/auth/infrastructure/owner-auth-composition";

import { observeRequest } from "../../../../lib/operations/logger";
export const runtime = "nodejs";

export function POST(request: NextRequest) {
  return observeRequest("auth.login", () =>
    withOwnerAuthHttpHandlers((handlers) => handlers.login(request)),
  );
}
