import "server-only";

import { requireR2StorageConfig } from "../../../../lib/config/r2-storage-config";
import { getServerEnv } from "../../../../lib/config/server-env";
import type { ObjectStore } from "../../application/ports/object-store";
import { CloudflareR2ObjectStore } from "./cloudflare-r2-object-store";

let objectStore: ObjectStore | undefined;

export function getR2ObjectStore(): ObjectStore {
  objectStore ??= new CloudflareR2ObjectStore(
    requireR2StorageConfig(getServerEnv()),
  );

  return objectStore;
}
