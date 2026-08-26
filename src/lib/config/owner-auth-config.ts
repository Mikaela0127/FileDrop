import type { ServerEnv } from "./server-env-schema";

export interface OwnerAuthConfig {
  appOrigin: string;
  passwordHash: string;
  secureCookies: boolean;
  sessionSecret: string;
}

export class OwnerAuthConfigurationError extends Error {
  constructor() {
    super("Owner authentication is not configured");
    this.name = "OwnerAuthConfigurationError";
  }
}

export function requireOwnerAuthConfig(
  environment: ServerEnv,
): OwnerAuthConfig {
  const { SESSION_SECRET: sessionSecret, UPLOAD_PASSWORD_HASH: passwordHash } =
    environment;

  if (!sessionSecret || !passwordHash) {
    throw new OwnerAuthConfigurationError();
  }

  const applicationUrl = new URL(environment.APP_URL);

  return {
    appOrigin: applicationUrl.origin,
    passwordHash,
    secureCookies: applicationUrl.protocol === "https:",
    sessionSecret,
  };
}
