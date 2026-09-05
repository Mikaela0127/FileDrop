import { type NextRequest, NextResponse } from "next/server";
import type { OwnerAuthentication } from "../../auth/application/owner-authentication";
import { OWNER_SESSION_COOKIE_NAME } from "../../auth/delivery/http/owner-auth-handlers";
import {
  logQuerySchema,
  LOG_RETENTION_DAYS,
  LOG_ROW_LIMIT,
  type LogRepository,
} from "../application/log-repository";

export function createOwnerLogsHandler(
  authentication: OwnerAuthentication,
  repository: Pick<LogRepository, "list">,
) {
  return async (request: NextRequest) => {
    const json = (body: unknown, status = 200) =>
      NextResponse.json(body, {
        status,
        headers: {
          "Cache-Control": "no-store",
          "Referrer-Policy": "no-referrer",
          Vary: "Cookie",
          "X-Content-Type-Options": "nosniff",
        },
      });
    try {
      if (
        !(await authentication.isAuthenticated(
          request.cookies.get(OWNER_SESSION_COOKIE_NAME)?.value,
        ))
      )
        return json({ error: { code: "UNAUTHENTICATED" } }, 401);
      if (request.nextUrl.search.length > 512)
        return json({ error: { code: "INVALID_QUERY" } }, 400);
      const params = [...request.nextUrl.searchParams];
      if (new Set(params.map(([key]) => key)).size !== params.length)
        return json({ error: { code: "INVALID_QUERY" } }, 400);
      const parsed = logQuerySchema.safeParse(Object.fromEntries(params));
      if (!parsed.success)
        return json({ error: { code: "INVALID_QUERY" } }, 400);
      return json({
        ...(await repository.list(parsed.data)),
        retentionDays: LOG_RETENTION_DAYS,
        maximumRecords: LOG_ROW_LIMIT,
      });
    } catch {
      // Never recurse into database logging when the log reader itself fails.
      return json({ error: { code: "LOGS_UNAVAILABLE" } }, 503);
    }
  };
}
