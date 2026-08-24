import { describe, expect, it } from "vitest";

import { parseServerEnv } from "./server-env-schema";

const validEnvironment = {
  APP_URL: "http://localhost:3000",
  DATABASE_URL: "postgresql://filedrop:filedrop@localhost:5432/filedrop",
};

describe("server environment", () => {
  it("accepts the minimum local development configuration", () => {
    expect(parseServerEnv(validEnvironment)).toMatchObject(validEnvironment);
  });

  it("rejects a non-PostgreSQL database URL", () => {
    expect(() =>
      parseServerEnv({
        ...validEnvironment,
        DATABASE_URL: "mysql://localhost/filedrop",
      }),
    ).toThrow("DATABASE_URL must use the postgres or postgresql protocol");
  });

  it("reports a readable error for a malformed application URL", () => {
    expect(() =>
      parseServerEnv({
        ...validEnvironment,
        APP_URL: "not-a-url",
      }),
    ).toThrow("APP_URL must be a valid URL");
  });

  it("rejects secrets that are too short when they are configured", () => {
    expect(() =>
      parseServerEnv({
        ...validEnvironment,
        SESSION_SECRET: "too-short",
      }),
    ).toThrow("SESSION_SECRET must contain at least 32 characters");
  });

  it("requires R2 credentials to be configured as one complete group", () => {
    expect(() =>
      parseServerEnv({
        ...validEnvironment,
        R2_ACCOUNT_ID: "account-id",
      }),
    ).toThrow("R2 configuration must provide all four R2 variables together");
  });
});
