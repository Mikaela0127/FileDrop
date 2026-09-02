# ADR 0014: Fail closed before production deployment

- Status: Accepted
- Date: 2026-09-01

## Context

FileDrop's local development defaults deliberately permit localhost, an
unencrypted local PostgreSQL connection, and partially unconfigured optional
services. Those defaults make incremental development practical, but accepting
them in production could publish an application with insecure cookies, missing
cleanup authentication, unavailable object storage, or an unencrypted database
connection.

The application also returns bearer share links and temporary R2 capabilities.
A browser that forwards the current path as a referrer, an intermediary that
caches redirects, or an unexpected script source would expand the exposure of
those capabilities. Repository automation is another trust boundary because a
mutable third-party GitHub Action tag can change without a source-code diff.

## Decision

Keep the flexible base environment parser for local development and add a
separate production contract. Before a Vercel build can publish, it must require:

- an exact non-loopback HTTPS `APP_URL` origin;
- a remote PostgreSQL URL with credentials, database name, and required TLS;
- complete owner authentication, cleanup authentication, and private R2 groups;
- different values for the session-signing and cleanup bearer secrets.

Validation errors name only the failed variables and rules. They never echo
configuration values. The Vercel build then generates the Prisma Client, applies
committed migrations, and builds the application. Preview environments receive
no production credentials by default and therefore fail closed until explicitly
given isolated preview resources.

Apply a common response-header policy through Next.js configuration. It disables
framing and unused browser capabilities, suppresses referrers, prevents MIME
sniffing, enables HSTS in production, and limits content and network sources. R2
is allowed only as an HTTPS connection destination so the direct-upload
architecture continues to work.

Use a static Content Security Policy for v1.0. Next.js hydration currently
requires inline scripts and styles under this static policy, so `script-src` and
`style-src` retain `'unsafe-inline'`. A nonce-based strict policy would remove
that allowance but force dynamic rendering for every protected page and reduce
cacheability. This trade-off is recorded rather than presenting the current CSP
as complete XSS isolation.

Pin GitHub Actions to resolved commit SHAs and let Dependabot propose weekly
updates for both pnpm dependencies and action references. Every update still
passes the existing public CI and secret-history scan before merge.

## Consequences

A local `pnpm build` remains usable with local services, while `pnpm
deploy:check` explicitly evaluates the stricter production contract. Vercel
cannot publish a build with missing or development-grade production settings.

Applying migrations during deployment makes the first release reproducible and
prevents a built application from reaching an absent schema. Migrations must be
additive and backward compatible because a Vercel application rollback does not
undo PostgreSQL changes. Destructive migrations require a separate expand-and-
contract rollout.

The security headers reduce several browser attack surfaces but do not replace
input validation, output encoding, authorization, rate limiting, or dependency
review. Moving to a nonce-based CSP remains a later hardening option if measured
XSS risk justifies fully dynamic rendering.
