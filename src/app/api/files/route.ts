import type { NextRequest } from "next/server";

import { withOwnerFileCatalogHttpHandler } from "../../../modules/files/infrastructure/owner-file-catalog-composition";

export const runtime = "nodejs";

export function GET(request: NextRequest) {
  return withOwnerFileCatalogHttpHandler((handler) => handler.list(request));
}
