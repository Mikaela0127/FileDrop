import { describe, expect, it } from "vitest";

import { assertLocalReleaseDatabaseUrl } from "./local-release-database";

describe("assertLocalReleaseDatabaseUrl", () => {
  it.each([
    "postgresql://filedrop:filedrop@localhost:5432/filedrop",
    "postgres://filedrop:filedrop@127.0.0.1:5432/filedrop",
    "postgresql://filedrop:filedrop@[::1]:5432/filedrop",
    "postgresql://filedrop:filedrop@localhost:5432/filedrop?application_name=filedrop-release",
  ])("accepts a loopback PostgreSQL URL", (value) => {
    expect(() => assertLocalReleaseDatabaseUrl(value)).not.toThrow();
  });

  it("rejects a missing database URL without echoing a value", () => {
    expect(() => assertLocalReleaseDatabaseUrl(undefined)).toThrow(
      "DATABASE_URL is required",
    );
  });

  it("rejects malformed URLs", () => {
    expect(() => assertLocalReleaseDatabaseUrl("not-a-url")).toThrow(
      "DATABASE_URL must be a valid PostgreSQL URL",
    );
  });

  it("rejects a non-PostgreSQL scheme", () => {
    expect(() =>
      assertLocalReleaseDatabaseUrl("https://localhost/filedrop"),
    ).toThrow("DATABASE_URL must use the postgres or postgresql scheme");
  });

  it.each([
    "postgresql://filedrop:secret@localhost:5432/filedrop?host=db.example.test",
    "postgresql://filedrop:secret@localhost:5432/filedrop?%68ost=db.example.test",
    "postgresql://filedrop:secret@localhost:5432/filedrop?host=%2Fvar%2Frun%2Fpostgresql",
  ])("rejects a driver-level host override without echoing it", (value) => {
    expect(() => assertLocalReleaseDatabaseUrl(value)).toThrow(
      "DATABASE_URL must not override the database host",
    );

    try {
      assertLocalReleaseDatabaseUrl(value);
    } catch (error) {
      expect(String(error)).not.toContain(value);
      expect(String(error)).not.toContain("secret");
      expect(String(error)).not.toContain("db.example.test");
    }
  });

  it.each([
    "postgresql://filedrop:secret@db.example.test/filedrop",
    "postgresql://filedrop:secret@127.0.0.1.example.test/filedrop",
  ])("rejects a remote database without including its URL", (value) => {
    expect(() => assertLocalReleaseDatabaseUrl(value)).toThrow(
      "Release checks refuse a remote DATABASE_URL",
    );

    try {
      assertLocalReleaseDatabaseUrl(value);
    } catch (error) {
      expect(String(error)).not.toContain(value);
      expect(String(error)).not.toContain("secret");
    }
  });
});
