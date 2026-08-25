import { describe, expect, it } from "vitest";

import { parseServerEnv } from "./server-env-schema";

const validEnvironment = {
  APP_URL: "http://localhost:3000",
  DATABASE_URL: "postgresql://filedrop:filedrop@localhost:5432/filedrop",
};

const validR2Environment = {
  R2_ACCOUNT_ID: "0123456789abcdef0123456789abcdef",
  R2_ACCESS_KEY_ID: "example-access-key-id",
  R2_SECRET_ACCESS_KEY: "example-secret-key-not-a-real-credential",
  R2_BUCKET_NAME: "filedrop-test",
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

  it("accepts a complete R2 configuration", () => {
    expect(
      parseServerEnv({
        ...validEnvironment,
        ...validR2Environment,
      }),
    ).toMatchObject(validR2Environment);
  });

  it("rejects an R2 account ID that cannot safely form an endpoint", () => {
    expect(() =>
      parseServerEnv({
        ...validEnvironment,
        ...validR2Environment,
        R2_ACCOUNT_ID: "account.example.test/path",
      }),
    ).toThrow("R2_ACCOUNT_ID must contain exactly 32 hexadecimal characters");
  });

  it.each(["FileDrop", "-filedrop", "filedrop-"])(
    "rejects an invalid R2 bucket name %s",
    (bucketName) => {
      expect(() =>
        parseServerEnv({
          ...validEnvironment,
          ...validR2Environment,
          R2_BUCKET_NAME: bucketName,
        }),
      ).toThrow("R2_BUCKET_NAME");
    },
  );

  it("does not include an R2 secret value in validation errors", () => {
    const secretValue = "example-secret-that-must-not-appear-in-errors";

    try {
      parseServerEnv({
        ...validEnvironment,
        ...validR2Environment,
        R2_SECRET_ACCESS_KEY: secretValue,
        R2_BUCKET_NAME: "INVALID_BUCKET",
      });
      throw new Error("Expected environment parsing to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).not.toContain(secretValue);
    }
  });
});
