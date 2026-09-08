# ADR 0018: Portable standalone containers for VPS deployment

- Status: Accepted
- Date: 2026-09-08

## Decision

Keep one FileDrop source tree and add a second deployment adapter instead of
forking a `FileDropLocal` application. Vercel continues to use its native build
unless `NEXT_OUTPUT=standalone` is set. Docker builds set that flag and package
the resulting minimal Node.js server.

The Dockerfile has two publishable targets:

- `runtime` contains only the traced Next.js standalone server, static assets,
  and a liveness check. It runs as the unprivileged `node` user.
- `operations` contains the pinned project toolchain used by the one-shot
  production configuration check and Prisma migration. It is never exposed to
  web traffic or kept running.

Production Compose runs only the application and Caddy continuously. Caddy is
the TLS and reverse-proxy boundary; port 3000 remains private on the Docker
network. Runtime secrets and the direct migration database credential live in
separate, ignored files outside the repository. The application receives the
pooled `DATABASE_URL`; only the release gate receives `DIRECT_URL`.

Compose makes the runtime depend on the release gate completing successfully,
and makes Caddy depend on the runtime becoming healthy. A normal release cannot
start the new application while validation or migration is failing.

The VPS initially keeps Neon PostgreSQL and Cloudflare R2. This migration moves
compute and scheduling, not database or object bytes. A host systemd timer
replaces Vercel Cron by calling the existing authenticated cleanup endpoint.

## Consequences

- There is one domain model, UI, test suite, and migration history to maintain.
- An image build cannot contact production services or contain production
  credentials. Non-secret placeholder URLs are used only while Next.js
  collects build data.
- Next.js standalone output excludes static assets by default, so the image
  copies `.next/static` explicitly. A build assertion also verifies Prisma's
  traced runtime before an image can be produced.
- Deployment remains an explicit sequence: build or pull immutable images,
  start the Compose dependency chain, then run the external smoke test.
- Code rollback selects an earlier runtime image. It does not reverse database
  migrations, R2 deletion, or key rotation, so migrations must remain backward
  compatible and old keyring entries must be retained.
- The existing root `compose.yaml` remains a disposable local PostgreSQL
  service. Production uses `deploy/compose.production.yaml`; mixing the two
  would risk deploying the development password and non-TLS database.
