import type { NextRequest } from "next/server";

import { withOwnerFileCatalogHttpHandler } from "../../../modules/files/infrastructure/owner-file-catalog-composition";

import { observeRequest } from "../../../lib/operations/logger";
export const runtime = "nodejs";

export function GET(request: NextRequest) {
  return observeRequest("files.list", () =>
    withOwnerFileCatalogHttpHandler((handler) => handler.list(request)),
  );
}
