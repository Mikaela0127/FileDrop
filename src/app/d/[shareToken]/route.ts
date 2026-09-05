import { handlePublicDownload } from "../../../modules/files/infrastructure/public-download-composition";

import { observeRequest } from "../../../lib/operations/logger";
export const runtime = "nodejs";

interface PublicDownloadRouteContext {
  params: Promise<{ shareToken: string }>;
}

export async function GET(
  _request: Request,
  context: PublicDownloadRouteContext,
) {
  const { shareToken } = await context.params;
  return observeRequest("download.resolve", () =>
    handlePublicDownload(shareToken),
  );
}
