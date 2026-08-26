import type { NextRequest } from "next/server";

import { withOwnerAuthHttpHandlers } from "../../../../modules/auth/infrastructure/owner-auth-composition";

export const runtime = "nodejs";

export function GET(request: NextRequest) {
  return withOwnerAuthHttpHandlers((handlers) => handlers.session(request));
}
