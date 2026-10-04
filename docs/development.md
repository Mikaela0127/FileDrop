# Development guide

Everything needed to run FileDrop locally and check a change before
committing it. For what the project is and why it is built this way, start
at the [documentation index](README.md).

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
[the R2 setup guide](deployment/cloudflare-r2.md) to the ignored `.env`
file, configure `SHARE_TOKEN_KEYRING` using the
[management upgrade guide](deployment/file-management-upgrade.md), configure bucket CORS, restart the development server, sign in, and open
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

Share tokens are stored only as a SHA-256 lookup hash and authenticated AES-256-GCM
ciphertext; the independent decryption key lives outside PostgreSQL. Presigned URLs
are never stored. Public download responses use
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
key and ciphertext. Links are retrieved separately, only after owner authentication:

- `POST /api/files/:fileId/share` — retrieve the same active share URL. Legacy
  hash-only files require `{ "confirmed": true }` once to replace the lost link.
- `POST /api/files/:fileId/expire` — confirm manual expiry without changing the
  original scheduled expiry timestamp.
- `DELETE /api/files/:fileId` — confirm deletion of an expired record. R2 deletion
  must succeed before metadata is removed; storage failures retain a retryable record.

All management requests require an exact same-origin header and strict JSON.
Expiry and deletion require `{ "confirmed": true }` in addition to the UI dialog.
Deleting records also removes their per-file statistics from the recent-record summary.
Physical deletion waits until at least 30 minutes after creation (upload URL lifetime
plus a cleanup safety buffer). It cannot forcibly stop an already-running transfer.

See the [upgrade and rollback guide](deployment/file-management-upgrade.md)
before deploying this change, and the [diagnostic log guide](operations/diagnostic-logs.md)
for retrieving safe troubleshooting output.

Open **File activity → View owner logs** to inspect recent application errors and
management operations. The owner-only viewer retains up to 7 days / 10,000 entries
in PostgreSQL and exports the displayed page. When the database itself is
unavailable, or the process crashes before it can write, fall back to the
platform logs of whichever host runs the application; no additional log-service
account is required.

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

Any trusted scheduler that can send an authenticated daily GET works. The
repository ships two: the committed `vercel.json` cron entry and the systemd
timer under `deploy/systemd/`, both at 03:00 UTC. Enable exactly one of them per
deployment, or the endpoint runs twice a day for no benefit.

A file becomes unavailable as soon as its database expiry is reached; the daily
job controls only when its bytes are physically removed. Failed deletions return
to the retry queue, while an interrupted `DELETING` job becomes reclaimable
after a 15-minute lease.

See [the scheduled cleanup deployment guide](deployment/scheduled-cleanup.md)
before enabling the production cron job. Do not reuse the owner passphrase,
session secret, R2 key, or any real share token as `CRON_SECRET`.

The committed Compose configuration exposes PostgreSQL only on
`127.0.0.1:5432`. Its `filedrop` password is for local development only and must
not be reused in production. The database volume survives ordinary container
restarts and `pnpm db:down`.

For a VPS deployment, keep this development database Compose file unchanged and
use the separate hardened application/Caddy configuration in
[the VPS Docker guide](deployment/vps-docker.md). The same source remains
deployable to Vercel; Docker selects Next.js standalone output only during image
construction.

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
[the browser E2E guide](testing/browser-e2e.md).

The same checks run in GitHub Actions for pull requests and pushes to `main`.
The default production build uses Next.js's supported Webpack path so it also
works in restricted development environments. Run `pnpm build:turbo` to evaluate
the default Turbopack build in an unrestricted environment.

Before your first commit, install the repository-owned secret-scanning hook:

```bash
brew install gitleaks
pnpm hooks:install
```

See [the commit security gate](security/commit-gate.md) for the full privacy
and credential review checklist.
