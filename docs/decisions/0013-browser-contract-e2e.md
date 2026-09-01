# ADR 0013: Test the owner browser journey at deterministic boundaries

- Status: Accepted
- Date: 2026-09-01

## Context

FileDrop's owner journey spans React state, Next.js navigation, authenticated
HTTP contracts, a browser-to-R2 PUT, PostgreSQL state, and a public download
redirect. Unit and integration tests cover the backend boundaries well, but they
cannot detect broken labels, focus behavior, client navigation, clipboard
output, narrow-screen overflow, or an incorrectly sequenced browser upload.

Running every pull request against live R2 and a real owner credential would
make CI slower and nondeterministic while increasing the risk of exposing
secrets or mutating shared cloud resources. Adding a production-only test switch
or bypass would create a more dangerous authorization path merely for tests.

## Decision

Run Playwright against the production-built Next.js application in desktop and
mobile Chromium. The test drives the owner journey from an unauthenticated
upload page through sign-in, upload initialization, direct PUT, completion,
one-time share-URL copy, and the owner activity catalog.

The browser test intercepts only the HTTP boundaries involved in that journey.
Fixtures return deterministic non-secret API responses and a zero-account,
R2-shaped upload URL that satisfies the production CSP without identifying a
real Cloudflare account. Playwright intercepts it before network access. The
test asserts outgoing methods, metadata, content type, and `If-None-Match`
header before returning success. No production code contains a test flag, mock
adapter, authentication bypass, or provider credential.

Backend confidence stays layered:

- domain, application, and HTTP behavior use Vitest;
- PostgreSQL concurrency and projections use repository integration tests;
- R2 signing and object operations use adapter tests;
- Playwright verifies browser orchestration, accessible interaction, and
  responsive rendering;
- production infrastructure receives a separate deployment smoke test.

GitHub Actions installs only Chromium, runs one worker for reproducibility, and
uploads the Playwright report only after a failure. Reports contain test fixture
data, never live tokens or credentials.

## Consequences

The public CI pipeline can catch owner-journey regressions without access to
Neon, R2, or real authentication secrets. Desktop and mobile projects share the
same behavioral assertions, so responsive changes cannot silently break the
core flow.

This suite is a browser contract test, not proof that a production object was
stored or downloaded. A passing run must therefore be interpreted together with
the backend test suites and, after deployment, the production smoke-test
checklist. Cross-browser Firefox and WebKit coverage can be added if real usage
or defect history justifies the additional CI download and runtime cost.
