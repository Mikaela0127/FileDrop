# FileDrop

FileDrop is a private, expiring file-transfer service built as a full-stack
engineering portfolio project. File metadata lives in PostgreSQL; file bytes live
in private S3-compatible object storage.

The application is under active development. The current repository contains the
Day 1 engineering foundation, not a usable upload service yet.

## Requirements

- Node.js 24
- pnpm 11
- Git

If you use `nvm`:

```bash
nvm install
nvm use
corepack enable
```

## Local development

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

Open <http://localhost:3000>.

The environment values are placeholders on Day 1. PostgreSQL and validated
runtime configuration are introduced on Day 2.

## Quality checks

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
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

## Confirmed MVP policy

- Owner-only uploads during the initial release
- 3 GB decimal maximum file size
- Expiry options: 1 hour, 24 hours, 3 days, and 7 days
- Private Cloudflare R2 bucket with presigned upload/download URLs
- PostgreSQL metadata and lifecycle state
- Provider-neutral application, provisionally deployed with Vercel + Neon + R2

## Delivery plan

The two-week implementation schedule runs from 2026-08-24 through 2026-09-06.
Day 2 adds Docker Compose, PostgreSQL, Prisma migrations, and environment
validation.
