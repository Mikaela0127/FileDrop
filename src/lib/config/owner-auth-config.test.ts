import { describe, expect, it } from "vitest";

import {
  OwnerAuthConfigurationError,
  requireOwnerAuthConfig,
} from "./owner-auth-config";
import type { ServerEnv } from "./server-env-schema";

const passwordHash = `$scrypt$ln=16,r=8,p=1$${Buffer.alloc(16, 1).toString("base64url")}$${Buffer.alloc(32, 2).toString("base64url")}`;
const baseEnvironment: ServerEnv = {
  APP_URL: "http://localhost:3000",
  DATABASE_URL: "postgresql://filedrop:filedrop@localhost:5432/filedrop",
};

describe("owner auth configuration", () => {
  it("maps local configuration without enabling Secure cookies", () => {
    expect(
      requireOwnerAuthConfig({
        ...baseEnvironment,
        SESSION_SECRET: "s".repeat(32),
        UPLOAD_PASSWORD_HASH: passwordHash,
      }),
    ).toEqual({
      appOrigin: "http://localhost:3000",
      passwordHash,
      secureCookies: false,
      sessionSecret: "s".repeat(32),
    });
  });

  it("enables Secure cookies for HTTPS deployment", () => {
    expect(
      requireOwnerAuthConfig({
        ...baseEnvironment,
        APP_URL: "https://filedrop.example.test/path",
        SESSION_SECRET: "s".repeat(32),
        UPLOAD_PASSWORD_HASH: passwordHash,
      }).secureCookies,
    ).toBe(true);
  });

  it("fails with a value-free error when auth is absent", () => {
    expect(() => requireOwnerAuthConfig(baseEnvironment)).toThrowError(
      OwnerAuthConfigurationError,
    );
  });
});
