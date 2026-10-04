# FileDrop

Private file sharing with expiring links. Browsers upload straight to object
storage, so the app server never handles file bytes.

**Live:** <https://filedrop.mikaela79.com> — uploads are owner-only by design.

## What I built

- **Direct-to-storage uploads.** The server signs a short-lived PUT URL, the
  browser sends bytes to Cloudflare R2, and a file becomes downloadable only
  after the server verifies the stored object's size and type.
- **Share links treated as credentials.** 256-bit tokens stored as a SHA-256
  lookup hash plus AES-256-GCM ciphertext, under a versioned keyring, so the
  owner can recover a link and keys can rotate.
- **Race-safe expiry.** Cleanup claims files under a lease with conditional
  updates, so overlapping runs cannot finalize the same file twice, and a failed
  storage delete is retried instead of lost.
- **Fail-closed deploys.** A one-shot release gate validates production config
  and applies migrations before the app container may start.
- **Tested in layers.** 300+ unit tests, integration tests against real
  PostgreSQL, Playwright end-to-end tests, and CI with secret scanning.

## Stack

Next.js 16 · React 19 · TypeScript · PostgreSQL with Prisma · Cloudflare R2 ·
Docker · Vitest · Playwright

## Run it locally

Requires Node.js 24, pnpm 11 and Docker.

```bash
cp .env.example .env
pnpm install
pnpm db:up
pnpm db:generate
pnpm db:migrate:deploy
pnpm dev
```

Uploads also need an owner passphrase and a private R2 bucket; the
[development guide](docs/development.md) walks through both.

## Documentation

- [Development guide](docs/development.md): setup, configuration, database and
  quality commands
- [Documentation index](docs/README.md): features, architecture, 19 design
  decision records, deployment and operations
- [Changelog](CHANGELOG.md) · [Contributing](CONTRIBUTING.md) ·
  [Security policy](SECURITY.md)

`v1.0.1` is the latest tagged release; `main` has moved ahead of it since.

## License

[MIT](LICENSE)
