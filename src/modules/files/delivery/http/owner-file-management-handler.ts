import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  readJsonBody,
  InvalidJsonRequestError,
} from "../../../../lib/http/read-json-body";
import { isTrustedMutationOrigin } from "../../../../lib/http/same-origin";
import { logEvent } from "../../../../lib/operations/logger";
import type { OwnerAuthentication } from "../../../auth/application/owner-authentication";
import { OWNER_SESSION_COOKIE_NAME } from "../../../auth/delivery/http/owner-auth-handlers";
import {
  FileManagementError,
  type createManageOwnerFile,
} from "../../application/manage-owner-file";

export type ManagementAction = "share" | "expire" | "remove";
const contract = z.object({ confirmed: z.boolean().optional() }).strict();
const headers = {
  "Cache-Control": "no-store",
  Pragma: "no-cache",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  Vary: "Cookie",
};
export function createOwnerFileManagementHandler(deps: {
  authentication: OwnerAuthentication;
  appOrigin: string;
  management: ReturnType<typeof createManageOwnerFile>;
}) {
  return async (
    request: NextRequest,
    id: string,
    action: ManagementAction,
  ): Promise<NextResponse> => {
    const json = (body: unknown, status = 200) =>
      NextResponse.json(body, { status, headers });
    try {
      if (!isTrustedMutationOrigin(request, deps.appOrigin))
        return json({ error: { code: "FORBIDDEN_ORIGIN" } }, 403);
      if (
        !(await deps.authentication.isAuthenticated(
          request.cookies.get(OWNER_SESSION_COOKIE_NAME)?.value,
        ))
      )
        return json({ error: { code: "UNAUTHENTICATED" } }, 401);
      if (!z.string().uuid().safeParse(id).success)
        return json({ error: { code: "INVALID_REQUEST" } }, 400);
      const parsed = contract.safeParse(await readJsonBody(request, 256));
      if (!parsed.success)
        return json({ error: { code: "INVALID_REQUEST" } }, 400);
      const confirmed = parsed.data.confirmed === true;
      if (action !== "share" && !confirmed)
        throw new FileManagementError("CONFIRMATION_REQUIRED");
      if (action === "share") {
        const { token } = await deps.management.share(id, confirmed);
        logEvent("files.share", { fileId: id });
        return json({ url: new URL(`/d/${token}`, deps.appOrigin).toString() });
      }
      await deps.management[action](id);
      logEvent(action === "expire" ? "files.expire" : "files.remove", {
        fileId: id,
      });
      return json({ success: true });
    } catch (error) {
      if (error instanceof InvalidJsonRequestError)
        return json({ error: { code: "INVALID_REQUEST" } }, 400);
      if (error instanceof FileManagementError)
        return json(
          { error: { code: error.code } },
          error.code === "FILE_NOT_FOUND" ? 404 : 409,
        );
      logEvent(
        action === "share"
          ? "files.share"
          : action === "expire"
            ? "files.expire"
            : "files.remove",
        { fileId: id, error },
      );
      return json({ error: { code: "FILE_MANAGEMENT_UNAVAILABLE" } }, 503);
    }
  };
}
