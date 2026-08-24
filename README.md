# FileDrop

FileDrop is a private, expiring file-transfer service built as a full-stack
engineering portfolio project. File metadata lives in PostgreSQL; file bytes live
in private S3-compatible object storage.

The application is under active development. The current repository contains the
Day 2 persistence foundation, not a usable upload service yet.

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
```

The same checks run in GitHub Actions for pull requests and pushes to `main`.
The default production build uses Next.js's supported Webpack path so it also
works in restricted development environments. Run `pnpm build:turbo` to evaluate
the default Turbopack build in an unrestricted environment.

## Architecture

- [Architecture overview](docs/architecture/README.md)
- [ADR 0001: Modular monolith](docs/decisions/0001-modular-monolith.md)
- [ADR 0002: Direct object-storage transfer](docs/decisions/0002-direct-object-storage-transfer.md)
- [ADR 0003: Owner-only uploads](docs/decisions/0003-owner-only-upload.md)
- [ADR 0004: PostgreSQL file metadata](docs/decisions/0004-postgresql-file-metadata.md)

## Confirmed MVP policy

- Owner-only uploads during the initial release
- 3 GB decimal maximum file size
- Expiry options: 1 hour, 24 hours, 3 days, and 7 days
- Private Cloudflare R2 bucket with presigned upload/download URLs
- PostgreSQL metadata and lifecycle state
- Provider-neutral application, provisionally deployed with Vercel + Neon + R2

## Delivery plan

The two-week implementation schedule runs from 2026-08-24 through 2026-09-06.
Day 2 establishes Docker Compose, PostgreSQL 18, Prisma migrations, validated
server configuration, and a provider-neutral file repository.
