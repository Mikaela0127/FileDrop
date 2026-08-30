import type { ServerEnv } from "./server-env-schema";

export interface CleanupConfig {
  cronSecret: string;
}

export class CleanupConfigurationError extends Error {
  constructor() {
    super("Scheduled cleanup is not configured");
    this.name = "CleanupConfigurationError";
  }
}

export function requireCleanupConfig(environment: ServerEnv): CleanupConfig {
  if (!environment.CRON_SECRET) {
    throw new CleanupConfigurationError();
  }

  return { cronSecret: environment.CRON_SECRET };
}
