import type { ServerEnv } from "./server-env-schema";

export interface R2StorageConfig {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
}

export class R2StorageConfigurationError extends Error {
  constructor() {
    super("R2 storage is not configured");
    this.name = "R2StorageConfigurationError";
  }
}

export function requireR2StorageConfig(
  environment: ServerEnv,
): R2StorageConfig {
  const {
    R2_ACCOUNT_ID: accountId,
    R2_ACCESS_KEY_ID: accessKeyId,
    R2_SECRET_ACCESS_KEY: secretAccessKey,
    R2_BUCKET_NAME: bucketName,
  } = environment;

  if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) {
    throw new R2StorageConfigurationError();
  }

  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucketName,
  };
}
