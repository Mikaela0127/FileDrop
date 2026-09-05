import type { NextRequest } from "next/server";
import { handleOwnerFileManagement } from "../../../../modules/files/infrastructure/owner-file-management-composition";
export const runtime = "nodejs";
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ fileId: string }> },
) {
  return handleOwnerFileManagement(
    request,
    (await context.params).fileId,
    "remove",
  );
}
