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
pnpm security:working-tree
pnpm security:audit
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm build
```

`security:secrets` examines committed Git history, while
`security:working-tree` examines tracked files and untracked files that are not
excluded by `.gitignore`. It stages copies in a uniquely named operating-system
temporary directory, scans them with redacted output, and removes that directory
afterward. Local `.env`, dependency, build, and test-output directories remain
outside the scan because they are not commit candidates.

Before a release, start and migrate the disposable local PostgreSQL database,
install Playwright Chromium, and run `pnpm release:check`. This
aggregates the checks above with Prisma validation, the dependency audit, and
browser E2E coverage. It rejects a remote `DATABASE_URL` before running the
data-mutating integration suite, including PostgreSQL connection strings that
try to override a loopback authority with a driver-level `host` query
parameter.

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

`pnpm-workspace.yaml` temporarily overrides three Prisma transitive
dependencies:

- `deepmerge-ts` 7.x to 8.0.0, the first release containing the
  circular-reference denial of service fix;
- `mysql2` below 3.23.1 to 3.23.1, the lowest release the audit gate accepts.
  Earlier versions carry advisories rated high, including an
  authentication-plugin downgrade that could disclose a MySQL password on a
  non-TLS connection.
- `fast-uri` 3.x below 3.1.8 to 3.1.8, which fixes all three URI parsing and
  serialization advisories reported against 3.1.6. It arrives through the
  Prisma CLI's `@prisma/dev` package, by way of `ajv`.

FileDrop uses PostgreSQL rather than MySQL, but keeping a known-high vulnerable
driver in Prisma's installed dependency graph would fail the repository's audit
gate. Remove each override once Prisma's resolved dependency graph stays patched
without it. Prisma validation, client generation, migrations, integration tests,
and the production build are required checks for these transitive overrides.

It also overrides two transitive dependencies of the ESLint toolchain, which
is a development dependency only:

- `brace-expansion` 1.x below 1.1.21 and 5.x below 5.0.12 to those releases,
  which fix the pattern expansion denial of service advisories;
- `js-yaml` 4.x below 4.3.2 to 4.3.2, which fixes a merge-key CPU denial of
  service.

Remove each of these once ESLint and `eslint-config-next` resolve a patched
version on their own. Lint is the required check for these overrides.

pnpm does not check that a replacement satisfies the range its dependent
declares: an override applies to any dependent whose declared range overlaps
the selector. The `deepmerge-ts` and `mysql2` overrides deliberately replace
exact versions that Prisma pins, so the Prisma checks above are what validate
them. Every dependent of `fast-uri`, `brace-expansion` and `js-yaml` currently
declares a range its replacement satisfies; when a dependency update changes
the lockfile, confirm that this still holds.

`pnpm-workspace.yaml` holds the thresholds actually in effect. When you raise one
there, update this section in the same commit.

## Audit exceptions

`audit.ignore` in `pnpm-workspace.yaml` exempts exactly one advisory from the
audit gate:

- `GHSA-vfj7-8cjw-p6xm`, a stack-exhaustion denial of service in `braces`
  through 3.0.3. No patched release exists, so no override can fix it. The only
  path to it is `eslint-config-next`, through `@next/eslint-plugin-next`,
  `fast-glob` and `micromatch`. The plugin only expands a glob when the ESLint
  configuration sets `settings.next.rootDir`, which this repository does not,
  so the vulnerable code is not reached. It is a development dependency and is
  not part of the runtime image. A change to the ESLint configuration could
  reach it, but only to stop a lint run, and with it the CI job; it cannot
  affect the deployed application.

Remove the exception as soon as `braces` publishes a fix, replacing it with an
override if the lint toolchain does not pick the fix up on its own. Exempt an
advisory only when no fix exists and the vulnerable code is unreachable from
untrusted input; list each one here with its reason, in the same commit.
