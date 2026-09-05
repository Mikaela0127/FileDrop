import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { readJsonBody } from "../../../../lib/http/read-json-body";
import { isTrustedMutationOrigin } from "../../../../lib/http/same-origin";
import { logEvent } from "../../../../lib/operations/logger";
import type { OwnerAuthentication } from "../../../auth/application/owner-authentication";
import { OWNER_SESSION_COOKIE_NAME } from "../../../auth/delivery/http/owner-auth-handlers";

const contract = z
  .object({
    stage: z.enum(["render", "initialize", "direct-upload", "complete"]),
    fileId: z.string().uuid().optional(),
  })
  .strict();
export function createClientDiagnosticsHandler({
  authentication,
  appOrigin,
}: {
  authentication: OwnerAuthentication;
  appOrigin: string;
}) {
  let windowStart = 0;
  let count = 0;
  return async (request: NextRequest) => {
    const reply = (status: number) =>
      NextResponse.json(
        { accepted: status === 202 },
        {
          status,
          headers: {
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
          },
        },
      );
    if (!isTrustedMutationOrigin(request, appOrigin)) return reply(403);
    if (
      !(await authentication.isAuthenticated(
        request.cookies.get(OWNER_SESSION_COOKIE_NAME)?.value,
      ))
    )
      return reply(401);
    if (Date.now() - windowStart > 60_000) {
      windowStart = Date.now();
      count = 0;
    }
    if (++count > 30) return reply(429); // Bounded per-instance intake, not a distributed rate limit.
    try {
      const parsed = contract.safeParse(await readJsonBody(request, 512));
      if (!parsed.success) return reply(400);
      logEvent("client.error", {
        fileId: parsed.data.fileId,
        clientStage: parsed.data.stage,
      });
      return reply(202);
    } catch {
      return reply(400);
    }
  };
}
