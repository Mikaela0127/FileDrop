# VPS Docker deployment

This guide moves FileDrop's application compute from Vercel to one Debian VPS
without changing the existing Neon PostgreSQL database, private Cloudflare R2
bucket, public origin, or application secrets. Keep the healthy Vercel deployment
available until the VPS has passed both smoke phases.

No completed secret file belongs in this repository. The files under `deploy/`
are empty templates only.

## Deployment shape

```text
Internet
   │ ports 80/443 only
   ▼
Caddy container ── private Docker network ──> FileDrop runtime container
                                                    ├── pooled TLS ──> Neon
                                                    └── signed API ──> R2

One-shot release-gate container
   ├── validate complete production configuration
   └── apply committed migrations through DIRECT_URL

Host systemd timer ── HTTPS + CRON_SECRET ──> /api/cron/cleanup
```

Caddy terminates TLS and does not enable request access logs. This is important
because the `/d/<shareToken>` path itself is a bearer credential. Application
logs remain structured and privacy-filtered. Docker rotates both services'
stdout logs with bounded files.

## 1. Understand the two images

The Dockerfile deliberately produces two different targets:

| Target       | Runs for            | Contents                                        |
| ------------ | ------------------- | ----------------------------------------------- |
| `runtime`    | continuously        | minimal Next.js server and traced dependencies  |
| `operations` | one release command | pnpm, Prisma CLI, validator, schema, migrations |

Migrations are not executed while building an image and are not executed by
every application start. This keeps builds deterministic and prevents two
replicas from racing a schema change.

## 2. Build and inspect locally

Start Docker Desktop (or another Docker daemon), then build from the repository
root. These commands use only local source and non-secret build placeholders:

```bash
docker build \
  --target runtime \
  --build-arg APP_REVISION="$(git rev-parse HEAD)" \
  --tag filedrop:local \
  .

docker build \
  --target operations \
  --tag filedrop-operations:local \
  .
```

The build must pass its standalone/Prisma artifact assertions. Confirm that the
runtime user is not root:

```bash
docker image inspect filedrop:local --format '{{.Config.User}}'
```

The expected output is `node`. A minimal read-only liveness test does not need
real credentials or a database connection:

```bash
docker run --detach --rm \
  --name filedrop-container-test \
  --read-only \
  --tmpfs /tmp:rw,noexec,nosuid,nodev,size=64m,uid=1000,gid=1000 \
  --tmpfs /app/.next/cache:rw,noexec,nosuid,nodev,size=64m,uid=1000,gid=1000 \
  --env APP_URL=http://127.0.0.1:3100 \
  --env DATABASE_URL=postgresql://unused:unused@127.0.0.1:5432/unused \
  --publish 127.0.0.1:3100:3000 \
  filedrop:local

curl --fail --silent --show-error http://127.0.0.1:3100/api/health
docker inspect filedrop-container-test --format '{{.State.Health.Status}}'
docker stop filedrop-container-test
```

Also open <http://127.0.0.1:3100> before stopping if you want to verify that the
copied `/_next/static/` browser assets render correctly. The dummy database URL
is unsuitable for any route that queries data.

An Apple Silicon Mac produces an arm64 image by default, while this VPS is
amd64. Native local tests should use the Mac image. Either build again on the
VPS, or later publish an amd64 image with Buildx; do not transfer an arm64-only
image to the server.

## 3. Prepare the VPS directory

Do this only after reviewing and committing the local changes, because an
uncommitted working tree is not available through `git clone`:

```bash
sudo install -d -m 0750 -o deploy -g deploy /opt/filedrop
sudo install -d -m 0700 -o deploy -g deploy /opt/filedrop/config
git clone https://github.com/Mikaela0127/FileDrop.git /opt/filedrop/app
cd /opt/filedrop/app
```

For the first deployment, building on the amd64 VPS is the simplest path. A
Next.js build peaks well above idle memory, so configure swap before the first
build on a small host; 2 GiB of swap absorbs the spike:

```bash
FILEDROP_BUILD_REVISION="$(git rev-parse HEAD)"
docker build --target runtime \
  --build-arg APP_REVISION="$FILEDROP_BUILD_REVISION" \
  --tag "filedrop:$FILEDROP_BUILD_REVISION" .
docker build --target operations \
  --tag "filedrop-operations:$FILEDROP_BUILD_REVISION" .
unset FILEDROP_BUILD_REVISION
```

The long-running app is limited to 768 MiB and Caddy to 256 MiB. Image building
uses more temporary memory than the final containers; it is not the normal
runtime footprint.

## 4. Create credential files outside Git

Copy the templates with restrictive permissions, then edit them interactively:

```bash
install -m 0600 deploy/runtime.env.example /opt/filedrop/config/runtime.env
install -m 0600 deploy/migration.env.example /opt/filedrop/config/migration.env
install -m 0640 deploy/deploy.env.example /opt/filedrop/config/deploy.env
nano /opt/filedrop/config/runtime.env
nano /opt/filedrop/config/migration.env
nano /opt/filedrop/config/deploy.env
```

Use the current production values rather than generating replacements during
the move. In particular, losing or replacing `SHARE_TOKEN_KEYRING` makes existing
links unrecoverable, and changing `SESSION_SECRET` signs out current sessions.

- `runtime.env` receives `APP_URL`, pooled `DATABASE_URL`, owner/session/cleanup
  values, the complete keyring, and R2 values. It does not receive `DIRECT_URL`.
- `migration.env` receives only the direct TLS `DIRECT_URL`.
- `deploy.env` names images, revision, hostname, and the two absolute file paths.
  Set both image tags to the full revision built in the preceding step.

The scrypt hash contains dollar signs. Store that entire value inside single
quotes in `runtime.env`, as shown by the template comment, so Compose does not
interpolate it. Never run `docker compose config` without `--quiet` against real
credential files because the expanded output can disclose values to the terminal.

## 5. Start the gated service chain

Define a short shell variable for the public deployment coordinates; it contains
no credentials:

```bash
FILEDROP_COMPOSE_ENV=/opt/filedrop/config/deploy.env
```

First validate the Compose model without printing it:

```bash
docker compose \
  --env-file "$FILEDROP_COMPOSE_ENV" \
  --file deploy/compose.production.yaml \
  config --quiet
```

The normal Compose start follows this enforced dependency chain:

```text
release-gate completed successfully -> app healthy -> Caddy starts
```

The one-shot gate validates all production rules before Prisma uses the direct
connection to apply committed migrations. Start the chain with:

```bash
docker compose \
  --env-file "$FILEDROP_COMPOSE_ENV" \
  --file deploy/compose.production.yaml \
  up --detach app caddy

docker compose \
  --env-file "$FILEDROP_COMPOSE_ENV" \
  --file deploy/compose.production.yaml \
  ps
unset FILEDROP_COMPOSE_ENV
```

Do not continue if validation, migration, or startup fails. Inspect the bounded
gate output with `docker compose --env-file /opt/filedrop/config/deploy.env
--file deploy/compose.production.yaml logs release-gate`. An existing healthy
application from the preceding release is not a reason to bypass a failed gate.

Only Caddy publishes host ports;
the application port, database, Caddy admin API, and Docker socket remain private.
Check this with `sudo ss -ltnup`. Do not continue if port 3000 or 5432 is bound to
a public address.

Allow SSH, TCP 80, TCP 443, and optionally UDP 443 for HTTP/3. Apply this in
both the provider's network firewall and the firewall on the VPS itself, if the
provider offers one. Do not expose any other FileDrop port.

## 6. Cut over DNS and verify

In Cloudflare DNS, replace the `filedrop` Vercel CNAME with an A record containing
the VPS IPv4. Remove any stale AAAA record unless IPv6 is configured on this VPS.
Use DNS-only mode initially so Caddy can obtain and test its origin certificate.
The public origin stays `https://filedrop.mikaela79.com`, so `APP_URL` and R2 CORS
do not change.

Watch only bounded logs while Caddy obtains TLS and the app starts:

```bash
docker compose \
  --env-file /opt/filedrop/config/deploy.env \
  --file deploy/compose.production.yaml \
  logs --tail 100 app caddy
```

From the development Mac, run the anonymous test and then the documented small,
disposable authenticated upload/download test:

```bash
FILEDROP_SMOKE_BASE_URL=https://filedrop.mikaela79.com pnpm smoke:production
```

The Docker health check proves only that the Node process responds. The external
smoke test additionally proves DNS, TLS, Caddy, headers, and anonymous security
boundaries. Neither proves a real R2 transfer, which is why the disposable manual
test remains necessary.

## 7. Install the cleanup timer

Vercel Cron does not move with the application. Create a root-readable
environment file holding the deployment's public origin and a `CRON_SECRET` that
exactly matches `runtime.env`, install the units, and test once before enabling
the daily schedule:

```bash
sudo install -m 0600 -o root -g root \
  deploy/cleanup.env.example /opt/filedrop/config/cleanup.env
sudoedit /opt/filedrop/config/cleanup.env
sudo systemd-analyze verify deploy/systemd/filedrop-cleanup.service \
  deploy/systemd/filedrop-cleanup.timer
sudo install -m 0644 deploy/systemd/filedrop-cleanup.service /etc/systemd/system/
sudo install -m 0644 deploy/systemd/filedrop-cleanup.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl start filedrop-cleanup.service
sudo systemctl status filedrop-cleanup.service
sudo systemctl enable --now filedrop-cleanup.timer
systemctl list-timers filedrop-cleanup.timer
```

The service imports the secret from the protected environment file and uses
curl's variable expansion, so the bearer value is not placed in the process
argument list. View a failed run with:

```bash
sudo journalctl -u filedrop-cleanup.service --since today --no-pager
```

Run exactly one production scheduler. Once the VPS has completed an observation
window, disable the Vercel cron/automatic production path or retire that deployment.

## 8. Update and roll back

For each reviewed revision, build new revision-tagged images instead of replacing
the previous tag. Update `deploy.env`, run `config --quiet`, then start the same
gated Compose chain. Finish with the external smoke test.

If application code regresses, point `deploy.env` back to the preceding runtime
image and recreate `app`. Do not attempt to reverse PostgreSQL migrations or R2
operations as part of a code rollback. Never run `docker compose down --volumes`:
the Caddy data volume contains certificate state. Keep at least one previously
verified image until the new release is proven healthy.

Useful resource checks are:

```bash
docker stats --no-stream
docker system df
df -h /
free -h
```

Delete old images deliberately by exact ID only after confirming they are not a
rollback target. Do not automate broad volume pruning on this server.
