# FileDrop

FileDrop is a self-hosted private file-transfer service with expiring share
links. It keeps file metadata in PostgreSQL and file bytes in a private
S3-compatible object store, so application servers never proxy large uploads or
downloads.

Version 1.0 provides an owner-authenticated upload workflow, direct Cloudflare
R2 transfers for files up to 3 GB, opaque public download links, configurable
expiry, automatic cleanup, download authorization statistics, and a responsive
owner activity view. The repository also includes production configuration
validation, browser security headers, CI, release checks, health monitoring,
smoke tests, and deployment and rollback documentation.

## Features

- Owner-only upload access with scrypt password verification and signed,
  `HttpOnly` sessions
- Direct-to-R2 uploads and short-lived download redirects
- PostgreSQL-backed metadata, lifecycle state, and download statistics
- Expiry choices from one hour to seven days with retryable scheduled deletion
- Responsive, keyboard-accessible owner interface
- Unit, integration, and browser end-to-end test coverage
- Production guardrails for secrets, dependencies, migrations, and deployment

## Requirements

- Node.js 24
- pnpm 11
- Docker Engine with Docker Compose
- Git

If you use `nvm`:

```bash
nvm install
nvm use
corepack enable
```

## Local development

```bash
cp .env.example .env
pnpm install
pnpm db:up
pnpm db:generate
pnpm db:migrate:deploy
pnpm dev
```

Open <http://localhost:3000>.

### Configure owner authentication

Choose a unique passphrase of at least 12 UTF-8 bytes. The following zsh/bash
commands read it without displaying it or putting it in shell history, then
print only its scrypt hash:

```bash
read -rs "FILEDROP_OWNER_PASSWORD?Owner passphrase: "
printf '\n'
printf '%s' "$FILEDROP_OWNER_PASSWORD" | pnpm auth:hash-password
unset FILEDROP_OWNER_PASSWORD
```

Copy the printed hash to `UPLOAD_PASSWORD_HASH` in the ignored `.env` file. Then
generate an independent session-signing secret and copy it to `SESSION_SECRET`:

```bash
openssl rand -hex 32
```

Never place the passphrase, hash, or session secret in a committed file, command
argument, issue, screenshot, or chat. Configure `SESSION_SECRET` and
`UPLOAD_PASSWORD_HASH` together. Restart `pnpm dev`, then open
<http://localhost:3000/login>. Production must set `APP_URL` to the exact HTTPS
application origin so the session cookie receives its `Secure` attribute.

The authentication endpoints are:

- `POST /api/auth/login` — verify the passphrase and create an eight-hour owner
  session.
- `POST /api/auth/logout` — clear the owner session.
- `GET /api/auth/session` — report whether the signed cookie is valid.

They intentionally return no session token in JSON. The browser stores the token
only in an `HttpOnly`, `SameSite=Strict` cookie.

### Configure Cloudflare R2 and upload

Add the four private R2 values described in
[the R2 setup guide](docs/deployment/cloudflare-r2.md) to the ignored `.env`
file, configure bucket CORS, restart the development server, sign in, and open
<http://localhost:3000/upload>.

The upload endpoints are:

- `POST /api/uploads/initialize` — authenticate the owner, validate at most 4
  KiB of strict metadata JSON, create a `PENDING` row, and return a 15-minute R2
  PUT URL.
- `POST /api/uploads/:fileId/complete` — authenticate again, inspect R2 with
  `HeadObject`, compare actual size and content type, then conditionally move
  the row to `READY`.

The browser sends file bytes directly to R2, never through Next.js or
PostgreSQL. The completion endpoint is safe to retry after success. A missing
object remains `PENDING`; an expired or mismatched object is rejected and
best-effort deleted.

The public download endpoint is:

- `GET /d/:shareToken` — validate the canonical 256-bit bearer token, look up
  only its SHA-256 hash, require a `READY` and unexpired record, then redirect to
  a five-minute presigned R2 `GetObject` URL. The authorization is shortened
  when the file expires sooner and requests an attachment filename without
  proxying bytes through Next.js.

The raw token and presigned URL are never stored. Public download responses use
`Cache-Control: no-store` and `Referrer-Policy: no-referrer`. Treat every share
link as a password: anyone who possesses it can download until file expiry.

FileDrop records one download authorization only after the signed R2 URL has passed
all safety checks and the file is still atomically confirmed as `READY` and
unexpired. PostgreSQL increments `downloadCount` without a read-modify-write
race and advances `lastDownloadedAt` without allowing an older concurrent
request to move the timestamp backwards. These counters measure redirects that
FileDrop authorized, not completed R2 byte transfers; repeated opens count as
separate handoffs. The values are stored for a later owner-only management view
and are not exposed by the public download route.

The owner catalog is available at <http://localhost:3000/files> and uses:

- `GET /api/files` — require a valid owner session, select at most the 50 newest
  records, and return only the metadata used by the management interface.

The response is uncached and omits the share-token hash and private R2 object
key. Existing share URLs cannot be listed because FileDrop intentionally never
stores their raw bearer tokens; copy the URL when an upload completes.

### Configure scheduled cleanup

Generate a third independent secret for the cleanup endpoint and place it only
in the ignored local `.env` file and the deployment provider's encrypted
environment settings:

```bash
openssl rand -hex 32
```

The cleanup endpoint is:

- `GET /api/cron/cleanup` — require `Authorization: Bearer <CRON_SECRET>`, mark
  due `PENDING` and `READY` rows as `EXPIRED`, claim at most 100 cleanup
  candidates, remove their private R2 objects, and finalize them as `DELETED`.

The committed `vercel.json` invokes this endpoint daily at 03:00 UTC, a schedule
compatible with Vercel Hobby. A file becomes unavailable as soon as its database
expiry is reached; the daily job controls only when its bytes are physically
removed. Failed deletions return to the retry queue, while an interrupted
`DELETING` job becomes reclaimable after a 15-minute lease.

See [the scheduled cleanup deployment guide](docs/deployment/scheduled-cleanup.md)
before enabling the production cron job. Do not reuse the owner passphrase,
session secret, R2 key, or any real share token as `CRON_SECRET`.

The committed Compose configuration exposes PostgreSQL only on
`127.0.0.1:5432`. Its `filedrop` password is for local development only and must
not be reused in production. The database volume survives ordinary container
restarts and `pnpm db:down`.

On macOS, Docker Desktop works. A lightweight open-source alternative is Docker
CLI plus Colima:

```bash
brew install docker docker-compose colima
colima start --cpu 2 --memory 4 --disk 30
```

## Database commands

```bash
pnpm db:up              # Start PostgreSQL and wait until it is healthy
pnpm db:down            # Stop PostgreSQL without deleting its volume
pnpm db:validate        # Validate the Prisma schema
pnpm db:generate        # Generate the local type-safe Prisma Client
pnpm db:migrate         # Create/apply migrations during development
pnpm db:migrate:deploy  # Apply committed migrations without editing them
pnpm db:studio          # Inspect local data in Prisma Studio
```

Generated Prisma Client files and `.env` are deliberately excluded from Git.
Run `pnpm db:generate` after installing dependencies or changing the schema.
In production, `DATABASE_URL` is the pooled runtime connection and `DIRECT_URL`
is the direct Prisma migration connection. Local Prisma commands fall back to
`DATABASE_URL` if `DIRECT_URL` is not configured.

## Quality checks

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm deploy:check       # Requires a complete production-grade environment
pnpm smoke:production   # Requires FILEDROP_SMOKE_BASE_URL after deployment
pnpm release:check      # Complete local release gate; refuses a remote database
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
pnpm security:secrets
pnpm security:working-tree
pnpm security:audit
```

Playwright runs the built Next.js application and verifies the browser journey
from sign-in through upload, share-URL copy, and owner activity. Its API and
presigned-storage responses are deterministic browser-boundary fixtures; they
contain no live passphrase, session, R2 credential, bucket, database, or share
token. Backend authorization, lifecycle, Prisma, and R2 adapter behavior remain
covered by unit and PostgreSQL integration tests. See
[the browser E2E guide](docs/testing/browser-e2e.md).

The same checks run in GitHub Actions for pull requests and pushes to `main`.
The default production build uses Next.js's supported Webpack path so it also
works in restricted development environments. Run `pnpm build:turbo` to evaluate
the default Turbopack build in an unrestricted environment.

Before your first commit, install the repository-owned secret-scanning hook:

```bash
brew install gitleaks
pnpm hooks:install
```

See [the commit security gate](docs/security/commit-gate.md) for the full privacy
and credential review checklist.

## Architecture

- [Architecture overview](docs/architecture/README.md)
- [ADR 0001: Modular monolith](docs/decisions/0001-modular-monolith.md)
- [ADR 0002: Direct object-storage transfer](docs/decisions/0002-direct-object-storage-transfer.md)
- [ADR 0003: Owner-only uploads](docs/decisions/0003-owner-only-upload.md)
- [ADR 0004: PostgreSQL file metadata](docs/decisions/0004-postgresql-file-metadata.md)
- [ADR 0005: Secure upload initialization](docs/decisions/0005-secure-upload-initialization.md)
- [ADR 0006: Cloudflare R2 presigned upload adapter](docs/decisions/0006-cloudflare-r2-upload-adapter.md)
- [ADR 0007: Owner passphrase and signed sessions](docs/decisions/0007-owner-passphrase-session.md)
- [ADR 0008: Verify stored objects before readiness](docs/decisions/0008-verified-upload-completion.md)
- [ADR 0009: Resolve public downloads with short-lived redirects](docs/decisions/0009-short-lived-download-redirect.md)
- [ADR 0010: Lease-based scheduled deletion](docs/decisions/0010-lease-based-scheduled-deletion.md)
- [ADR 0011: Count authorized download handoffs](docs/decisions/0011-authorized-download-statistics.md)
- [ADR 0012: Expose a bounded owner-only file catalog](docs/decisions/0012-owner-file-catalog.md)
- [ADR 0013: Test the owner browser journey at deterministic boundaries](docs/decisions/0013-browser-contract-e2e.md)
- [ADR 0014: Fail closed before production deployment](docs/decisions/0014-production-deployment-guardrails.md)
- [ADR 0015: Separate public liveness from read-only smoke tests](docs/decisions/0015-public-liveness-and-read-only-smoke-tests.md)
- [ADR 0016: Separate runtime and migration database connections](docs/decisions/0016-separate-runtime-and-migration-database-connections.md)
- [Cloudflare R2 setup](docs/deployment/cloudflare-r2.md)
- [Owner authentication setup](docs/deployment/owner-authentication.md)
- [Scheduled cleanup setup](docs/deployment/scheduled-cleanup.md)
- [Production deployment runbook](docs/deployment/production-readiness.md)
- [Production monitoring and first response](docs/operations/production-monitoring.md)
- [v1.0 release checklist](docs/deployment/release-checklist.md)
- [Browser E2E testing](docs/testing/browser-e2e.md)
- [Contribution guide](CONTRIBUTING.md)
- [Private vulnerability reporting policy](SECURITY.md)

## Version 1.0 scope

- Owner-only uploads
- 3 GB decimal maximum file size
- Expiry options: 1 hour, 24 hours, 3 days, and 7 days
- Private Cloudflare R2 bucket with presigned upload/download URLs
- PostgreSQL metadata and lifecycle state
- Provider-neutral application, provisionally deployed with Vercel + Neon + R2

## Release

`v1.0.1` is the current stable source release of FileDrop. See the
[changelog](CHANGELOG.md) for its contents and the
[release checklist](docs/deployment/release-checklist.md) for production rollout.
Running an instance requires operator-owned PostgreSQL, private S3-compatible
storage, deployment, DNS, and secret configuration; no production credentials
or user files are included in this repository.
