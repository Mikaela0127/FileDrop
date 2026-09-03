# ADR 0016: Separate runtime and migration database connections

- Status: Accepted
- Date: 2026-09-03

## Context

FileDrop runs on a serverless application platform, where short-lived instances
benefit from Neon's PgBouncer-backed pooled connection. Prisma migrations have a
different lifecycle and should use a direct PostgreSQL connection so schema
operations do not depend on transaction-pooler behavior.

Using one connection value for both concerns either gives the runtime an
unpooled connection or makes deployment migrations depend on a pooler. The
production build must also fail before touching the database when either value
is absent or unsafe.

## Decision

- Use `DATABASE_URL` as the pooled connection consumed by the runtime
  `@prisma/adapter-pg` adapter.
- Use `DIRECT_URL` as the direct connection consumed by Prisma CLI commands.
- Let local Prisma commands fall back to `DATABASE_URL` for compatibility with
  the disposable local PostgreSQL service.
- Require both values in production, with non-loopback hosts, credentials,
  database names, and TLS.
- Reject query-level `host` overrides so validation describes the connection the
  PostgreSQL driver will actually attempt.
- Require exactly one accepted `sslmode` value so a duplicate query parameter
  cannot replace the validated TLS policy inside the PostgreSQL driver.
- Keep both values in encrypted deployment settings and out of source control,
  logs, screenshots, issues, and chat.

## Consequences

- Serverless request traffic uses connection pooling without coupling schema
  changes to PgBouncer behavior.
- Deployments apply committed migrations through a direct connection before the
  new application build is published.
- Production requires one additional sensitive environment variable.
- Providers where pooled and direct endpoints are identical may supply the same
  secure URL, although Neon deployments should use the two URLs shown by its
  connection dialog.
