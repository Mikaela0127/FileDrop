import type { NextRequest } from "next/server";

import { withOwnerAuthHttpHandlers } from "../../../../modules/auth/infrastructure/owner-auth-composition";

export const runtime = "nodejs";

export function POST(request: NextRequest) {
  return withOwnerAuthHttpHandlers((handlers) => handlers.login(request));
}
