# Contributing to FileDrop

FileDrop is a learning-focused but production-oriented modular monolith. Small,
well-explained changes with tests are preferred over broad feature additions.

## Before changing code

1. Read the [architecture overview](docs/architecture/README.md) and the ADR
   related to the area you want to change.
2. Open an issue before changing a security boundary, database lifecycle, public
   API contract, or storage provider abstraction.
3. Never use a real credential, share token, private file name, production URL,
   database export, or user file as a fixture.

## Local setup

Follow the [README](README.md) to install Node.js, pnpm, PostgreSQL, and the
generated Prisma Client. Use only the disposable local database and a dedicated
test bucket when storage access is required.

Create a focused branch, make the smallest coherent change, and add tests at the
lowest useful layer. New architectural decisions should include an ADR under
`docs/decisions`.

## Required checks

Run the checks relevant to the change while developing. Before proposing a
release, start and migrate the local database, install Playwright Chromium, and
run:

```bash
pnpm release:check
```

The release command intentionally refuses a remote `DATABASE_URL` because the
integration suite modifies data. This includes PostgreSQL URLs that display a
loopback hostname but attempt to override the driver's effective `host` through
a query parameter. The command scans Git history and the current working tree
for secrets, audits dependencies, validates Prisma, checks formatting and types,
runs unit and integration tests, builds the production application, and
exercises the owner journey in Chromium.

Review the diff manually for personal or sensitive information even when every
automated check passes. See the [commit security gate](docs/security/commit-gate.md).

## Pull requests

Explain the problem, the chosen design, important trade-offs, and how the change
was verified. Keep refactors separate from behavior changes where practical.
Do not weaken validation, authentication, storage privacy, security headers, or
secret scanning merely to make a test pass.

Suspected vulnerabilities belong in a private report described by
[SECURITY.md](SECURITY.md), not a public issue or pull request.
