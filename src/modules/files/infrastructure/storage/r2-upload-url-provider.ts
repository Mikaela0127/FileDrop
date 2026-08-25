import "server-only";

import { CloudflareR2UploadUrlProvider } from "./cloudflare-r2-upload-url-provider";
import type { UploadUrlProvider } from "../../application/ports/upload-url-provider";
import { requireR2StorageConfig } from "../../../../lib/config/r2-storage-config";
import { getServerEnv } from "../../../../lib/config/server-env";

let uploadUrlProvider: UploadUrlProvider | undefined;

export function getR2UploadUrlProvider(): UploadUrlProvider {
  uploadUrlProvider ??= new CloudflareR2UploadUrlProvider(
    requireR2StorageConfig(getServerEnv()),
  );

  return uploadUrlProvider;
}
