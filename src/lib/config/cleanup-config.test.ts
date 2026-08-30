import { describe, expect, it } from "vitest";

import {
  CleanupConfigurationError,
  requireCleanupConfig,
} from "./cleanup-config";
import type { ServerEnv } from "./server-env-schema";

const baseEnvironment: ServerEnv = {
  APP_URL: "http://localhost:3000",
  DATABASE_URL: "postgresql://filedrop:filedrop@localhost:5432/filedrop",
};

describe("scheduled cleanup configuration", () => {
  it("returns the validated cron secret", () => {
    const cronSecret = "c".repeat(32);

    expect(
      requireCleanupConfig({ ...baseEnvironment, CRON_SECRET: cronSecret }),
    ).toEqual({ cronSecret });
  });

  it("fails without exposing configuration details", () => {
    expect(() => requireCleanupConfig(baseEnvironment)).toThrowError(
      CleanupConfigurationError,
    );
  });
});
