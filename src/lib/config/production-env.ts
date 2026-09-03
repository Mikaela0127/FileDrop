import type { ServerEnv } from "./server-env-schema";
import { parseServerEnv } from "./server-env-schema";

const requiredProductionKeys = [
  "DIRECT_URL",
  "SESSION_SECRET",
  "UPLOAD_PASSWORD_HASH",
  "CRON_SECRET",
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET_NAME",
] as const;

type RequiredProductionKey = (typeof requiredProductionKeys)[number];

export type ProductionEnv = ServerEnv &
  Required<Pick<ServerEnv, RequiredProductionKey>>;

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/gu, "");

  return (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized === "0.0.0.0" ||
    normalized === "::1" ||
    normalized.startsWith("127.")
  );
}

function validateProductionAppUrl(value: string): string[] {
  const url = new URL(value);
  const issues: string[] = [];

  if (url.protocol !== "https:") {
    issues.push("APP_URL must use HTTPS in production");
  }

  if (
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    issues.push(
      "APP_URL must be an exact origin without credentials, path, query, or fragment",
    );
  }

  if (isLoopbackHostname(url.hostname)) {
    issues.push("APP_URL must use a non-loopback production host");
  }

  return issues;
}

function validateProductionDatabaseUrl(
  value: string,
  variableName: "DATABASE_URL" | "DIRECT_URL",
): string[] {
  const url = new URL(value);
  const issues: string[] = [];

  if (!url.hostname || isLoopbackHostname(url.hostname)) {
    issues.push(`${variableName} must use a non-loopback production host`);
  }

  if (!url.username || !url.password || url.pathname === "/") {
    issues.push(
      `${variableName} must include a database user, password, and database name`,
    );
  }

  if (url.searchParams.has("host")) {
    issues.push(
      `${variableName} must not override the database host in query parameters`,
    );
  }

  const sslModes = url.searchParams.getAll("sslmode");
  if (
    sslModes.length !== 1 ||
    !["require", "verify-ca", "verify-full"].includes(sslModes[0] ?? "")
  ) {
    issues.push(
      `${variableName} must require TLS with sslmode=require, verify-ca, or verify-full`,
    );
  }

  return issues;
}

export function parseProductionEnv(
  environment: Record<string, string | undefined>,
): ProductionEnv {
  const issues: string[] = [];

  for (const key of requiredProductionKeys) {
    if (!environment[key]) {
      issues.push(`${key} is required in production`);
    }
  }

  if (issues.length > 0) {
    throw new Error(
      `Invalid production environment:\n${issues.map((issue) => `- ${issue}`).join("\n")}`,
    );
  }

  const parsed = parseServerEnv(environment);

  issues.push(...validateProductionAppUrl(parsed.APP_URL));
  issues.push(
    ...validateProductionDatabaseUrl(parsed.DATABASE_URL, "DATABASE_URL"),
  );
  if (parsed.DIRECT_URL) {
    issues.push(
      ...validateProductionDatabaseUrl(parsed.DIRECT_URL, "DIRECT_URL"),
    );
  }

  if (
    parsed.SESSION_SECRET &&
    parsed.CRON_SECRET &&
    parsed.SESSION_SECRET === parsed.CRON_SECRET
  ) {
    issues.push("SESSION_SECRET and CRON_SECRET must be independent values");
  }

  if (issues.length > 0) {
    throw new Error(
      `Invalid production environment:\n${issues.map((issue) => `- ${issue}`).join("\n")}`,
    );
  }

  return parsed as ProductionEnv;
}
