import { describe, expect, it } from "vitest";

import {
  R2StorageConfigurationError,
  requireR2StorageConfig,
} from "./r2-storage-config";
import type { ServerEnv } from "./server-env-schema";

const baseEnvironment: ServerEnv = {
  APP_URL: "http://localhost:3000",
  DATABASE_URL: "postgresql://filedrop:filedrop@localhost:5432/filedrop",
};

describe("R2 storage configuration", () => {
  it("maps validated server environment values to provider configuration", () => {
    expect(
      requireR2StorageConfig({
        ...baseEnvironment,
        R2_ACCOUNT_ID: "0123456789abcdef0123456789abcdef",
        R2_ACCESS_KEY_ID: "example-access-key-id",
        R2_SECRET_ACCESS_KEY: "example-secret-key-not-a-real-credential",
        R2_BUCKET_NAME: "filedrop-test",
      }),
    ).toEqual({
      accountId: "0123456789abcdef0123456789abcdef",
      accessKeyId: "example-access-key-id",
      secretAccessKey: "example-secret-key-not-a-real-credential",
      bucketName: "filedrop-test",
    });
  });

  it("fails without exposing which credential is absent", () => {
    expect(() => requireR2StorageConfig(baseEnvironment)).toThrowError(
      R2StorageConfigurationError,
    );
  });
});
