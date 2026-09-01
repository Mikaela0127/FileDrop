# Browser E2E testing

Day 11 adds Playwright coverage for the owner-facing happy path at desktop and
mobile Chromium viewports.

## Local run

Build the application, install the browser managed by the pinned Playwright
version, then run the tests:

```bash
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
```

Use `pnpm test:e2e:ui` for Playwright's interactive debugging interface. Test
videos, screenshots, traces, and HTML reports are ignored by Git.

## Covered browser journey

```text
Home
  -> unauthenticated upload state
  -> owner sign-in
  -> choose file and expiration
  -> initialize upload
  -> direct object PUT
  -> complete verification
  -> copy one-time share URL
  -> review owner file activity
```

The suite also verifies that the global skip link receives keyboard focus and
that the main landmark receives focus after activation. Every happy-path page
is checked for horizontal overflow at both configured viewport sizes.
Production-built responses are checked for the CSP, referrer suppression, HSTS,
anti-framing, and MIME-sniffing headers configured on every route.

## Trust boundary

Playwright starts the built Next.js application but intercepts the browser's
same-origin API requests and a zero-account, R2-shaped PUT URL before any network
request leaves the browser. The fixture matches the production Content Security
Policy without identifying a real Cloudflare account. Fixtures are intentionally
fake and deterministic. They must never be replaced with a real passphrase,
cookie, share token, bucket name, presigned URL, or cloud credential in a
committed test.

This boundary tests the UI-to-HTTP contract. Run `pnpm test` and
`pnpm test:integration` for server behavior, then use the production smoke-test
checklist to validate deployed Neon, R2, CORS, HTTPS, and scheduled cleanup.
