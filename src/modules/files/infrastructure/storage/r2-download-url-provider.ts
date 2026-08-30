import "server-only";

import { requireR2StorageConfig } from "../../../../lib/config/r2-storage-config";
import { getServerEnv } from "../../../../lib/config/server-env";
import type { DownloadUrlProvider } from "../../application/ports/download-url-provider";
import { CloudflareR2DownloadUrlProvider } from "./cloudflare-r2-download-url-provider";

let downloadUrlProvider: DownloadUrlProvider | undefined;

export function getR2DownloadUrlProvider(): DownloadUrlProvider {
  downloadUrlProvider ??= new CloudflareR2DownloadUrlProvider(
    requireR2StorageConfig(getServerEnv()),
  );

  return downloadUrlProvider;
}
