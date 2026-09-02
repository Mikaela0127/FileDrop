# Commit security gate

FileDrop treats every Git commit as a possible public release. A local
pre-commit hook scans the staged diff with Gitleaks before Git creates a commit.
The CI workflow scans the repository history again with the official MIT-licensed
Gitleaks CLI image pinned to an immutable digest.

## One-time setup

Install Gitleaks and enable the repository-owned hooks:

```bash
brew install gitleaks
pnpm hooks:install
```

On other operating systems, install the Gitleaks CLI from its official release
and then run `pnpm hooks:install`.

## Checks before every commit

```bash
pnpm security:secrets
pnpm security:audit
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm build
```

Also inspect `git diff --cached` for personal information that a secret scanner
cannot reliably identify, including real names, email addresses, private domain
configuration, local absolute paths, file names, database exports, production
URLs, access tokens, signed URLs, and credentials.

Never add an allowlist entry merely to make a failing scan pass. First establish
that the match is a non-sensitive test fixture; keep any exception narrow and
document why it is safe.

If a real secret is ever committed, deleting it in a later commit is not enough.
Revoke or rotate the credential immediately, then remove it from Git history
before publishing the repository.

## Dependency overrides

`pnpm-workspace.yaml` temporarily overrides two Prisma transitive dependencies:

- `deepmerge-ts` 7.x to 8.0.0, the first release containing the
  circular-reference denial of service fix;
- `mysql2` below 3.22.0 to 3.22.0, which rejects an authentication-plugin
  downgrade that could otherwise disclose a MySQL password on a non-TLS
  connection.

FileDrop uses PostgreSQL rather than MySQL, but keeping a known-high vulnerable
driver in Prisma's installed dependency graph would fail the repository's audit
gate. Remove each override after Prisma declares an equivalent patched version
directly. Prisma validation, client generation, migrations, integration tests,
and the production build are required checks for these transitive overrides.
