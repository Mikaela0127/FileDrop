import { describe, expect, it } from "vitest";

import { parseProductionEnv } from "./production-env";

const ownerPasswordHash = `$scrypt$ln=16,r=8,p=1$${Buffer.alloc(16, 3).toString("base64url")}$${Buffer.alloc(32, 4).toString("base64url")}`;

const validProductionEnvironment = {
  APP_URL: "https://filedrop.example.test",
  DATABASE_URL:
    "postgresql://filedrop:fixture-password@db.example.test/filedrop?sslmode=require",
  SESSION_SECRET: "session-fixture-value-".repeat(2),
  UPLOAD_PASSWORD_HASH: ownerPasswordHash,
  CRON_SECRET: "cleanup-fixture-value-".repeat(2),
  R2_ACCOUNT_ID: "0123456789abcdef0123456789abcdef",
  R2_ACCESS_KEY_ID: "fixture-access-key-id",
  R2_SECRET_ACCESS_KEY: "fixture-storage-credential",
  R2_BUCKET_NAME: "filedrop-production-test",
};

describe("production environment", () => {
  it("accepts a complete HTTPS, TLS-protected production configuration", () => {
    expect(parseProductionEnv(validProductionEnvironment)).toMatchObject(
      validProductionEnvironment,
    );
  });

  it.each([
    "SESSION_SECRET",
    "UPLOAD_PASSWORD_HASH",
    "CRON_SECRET",
    "R2_ACCOUNT_ID",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_BUCKET_NAME",
  ])("requires %s", (key) => {
    expect(() =>
      parseProductionEnv({
        ...validProductionEnvironment,
        [key]: undefined,
      }),
    ).toThrow(`${key} is required in production`);
  });

  it.each([
    "http://filedrop.example.test",
    "https://localhost:3000",
    "https://filedrop.example.test/unexpected-path",
    "https://user@filedrop.example.test",
  ])("rejects an unsafe application origin: %s", (appUrl) => {
    expect(() =>
      parseProductionEnv({
        ...validProductionEnvironment,
        APP_URL: appUrl,
      }),
    ).toThrow("APP_URL");
  });

  it.each([
    "postgresql://filedrop:fixture-password@localhost/filedrop?sslmode=require",
    "postgresql://filedrop:fixture-password@db.example.test/filedrop",
    "postgresql://filedrop:fixture-password@db.example.test/filedrop?sslmode=disable",
    "postgresql://db.example.test/filedrop?sslmode=require",
  ])("rejects an unsafe production database URL: %s", (databaseUrl) => {
    expect(() =>
      parseProductionEnv({
        ...validProductionEnvironment,
        DATABASE_URL: databaseUrl,
      }),
    ).toThrow("DATABASE_URL");
  });

  it("requires independent session and cleanup secrets", () => {
    expect(() =>
      parseProductionEnv({
        ...validProductionEnvironment,
        CRON_SECRET: validProductionEnvironment.SESSION_SECRET,
      }),
    ).toThrow("SESSION_SECRET and CRON_SECRET must be independent values");
  });

  it("never includes credential values in a validation error", () => {
    const credentialValue = "fixture-value-that-must-remain-private";

    try {
      parseProductionEnv({
        ...validProductionEnvironment,
        DATABASE_URL: `postgresql://filedrop:${credentialValue}@localhost/filedrop`,
        R2_SECRET_ACCESS_KEY: credentialValue,
      });
      throw new Error("Expected production environment parsing to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).not.toContain(credentialValue);
    }
  });
});
