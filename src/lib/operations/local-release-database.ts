const LOCAL_DATABASE_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "[::1]",
]);

export function assertLocalReleaseDatabaseUrl(value: string | undefined): void {
  if (!value) {
    throw new Error(
      "DATABASE_URL is required. Point it at the disposable local FileDrop database.",
    );
  }

  let databaseUrl: URL;

  try {
    databaseUrl = new URL(value);
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL URL.");
  }

  if (!["postgres:", "postgresql:"].includes(databaseUrl.protocol)) {
    throw new Error("DATABASE_URL must use the postgres or postgresql scheme.");
  }

  // node-postgres honors a `host` query parameter before the URL authority.
  // Reject it so a localhost-looking URL cannot redirect integration tests to
  // a remote database, for example: postgresql://...@localhost/db?host=remote.
  if (databaseUrl.searchParams.has("host")) {
    throw new Error(
      "DATABASE_URL must not override the database host in query parameters.",
    );
  }

  if (!LOCAL_DATABASE_HOSTS.has(databaseUrl.hostname)) {
    throw new Error(
      "Release checks refuse a remote DATABASE_URL because integration tests modify data. Use the disposable local PostgreSQL database.",
    );
  }
}
