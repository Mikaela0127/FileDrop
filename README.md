# FileDrop

FileDrop is a private, expiring file-transfer service built as a full-stack
engineering portfolio project. File metadata lives in PostgreSQL; file bytes live
in private S3-compatible object storage.

The application is under active development. Day 9 provides a complete expiring
transfer path with basic download statistics: the owner uploads directly to R2,
FileDrop verifies the stored object, an opaque public link resolves eligible
files to a five-minute R2 download authorization, each successful authorization
handoff is counted, and an authenticated daily job removes expired objects.

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

The Day 5 authentication endpoints are:

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

The Day 6 upload endpoints are:

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

The Day 7 public download endpoint is:

- `GET /d/:shareToken` — validate the canonical 256-bit bearer token, look up
  only its SHA-256 hash, require a `READY` and unexpired record, then redirect to
  a five-minute presigned R2 `GetObject` URL. The authorization is shortened
  when the file expires sooner and requests an attachment filename without
  proxying bytes through Next.js.

The raw token and presigned URL are never stored. Public download responses use
`Cache-Control: no-store` and `Referrer-Policy: no-referrer`. Treat every share
link as a password: anyone who possesses it can download until file expiry.

Day 9 records one download authorization only after the signed R2 URL has passed
all safety checks and the file is still atomically confirmed as `READY` and
unexpired. PostgreSQL increments `downloadCount` without a read-modify-write
race and advances `lastDownloadedAt` without allowing an older concurrent
request to move the timestamp backwards. These counters measure redirects that
FileDrop authorized, not completed R2 byte transfers; repeated opens count as
separate handoffs. The values are stored for a later owner-only management view
and are not exposed by the public download route.

### Configure scheduled cleanup

Generate a third independent secret for the cleanup endpoint and place it only
in the ignored local `.env` file and the deployment provider's encrypted
environment settings:

```bash
openssl rand -hex 32
```

The Day 8 cleanup endpoint is:

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

## Quality checks

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm build
pnpm security:secrets
pnpm security:audit
```

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
- [Cloudflare R2 setup](docs/deployment/cloudflare-r2.md)
- [Owner authentication setup](docs/deployment/owner-authentication.md)
- [Scheduled cleanup setup](docs/deployment/scheduled-cleanup.md)

## Confirmed MVP policy

- Owner-only uploads during the initial release
- 3 GB decimal maximum file size
- Expiry options: 1 hour, 24 hours, 3 days, and 7 days
- Private Cloudflare R2 bucket with presigned upload/download URLs
- PostgreSQL metadata and lifecycle state
- Provider-neutral application, provisionally deployed with Vercel + Neon + R2

## Delivery plan

The two-week implementation schedule runs from 2026-08-24 through 2026-09-06.
Day 8 implements authenticated scheduled expiry, concurrency-safe cleanup
leases, retryable R2 deletion, and durable `DELETED` metadata. Day 9 adds
concurrency-safe download-authorization counters without changing the direct R2
storage boundary. A later owner-only management view can present those stored
statistics without exposing file metadata through the public bearer-link route.
