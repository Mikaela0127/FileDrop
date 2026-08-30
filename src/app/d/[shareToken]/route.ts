import { handlePublicDownload } from "../../../modules/files/infrastructure/public-download-composition";

export const runtime = "nodejs";

interface PublicDownloadRouteContext {
  params: Promise<{ shareToken: string }>;
}

export async function GET(
  _request: Request,
  context: PublicDownloadRouteContext,
) {
  const { shareToken } = await context.params;
  return handlePublicDownload(shareToken);
}
