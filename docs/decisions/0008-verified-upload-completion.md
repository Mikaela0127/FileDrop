# ADR 0008: Verify stored objects before readiness

- Status: Accepted
- Date: 2026-08-28

## Context

A successful browser `PUT` proves only that the browser received a successful
storage response. Initialization records client-supplied size and content type,
and browser code cannot reliably set a signed `Content-Length`. Marking a file
downloadable from that claim would permit incorrect metadata and could bypass
the 3 GB application policy.

Completion may also be duplicated, delayed beyond expiry, or race with another
lifecycle transition. The design must preserve a trustworthy database state
without routing up to 3 GB through the Next.js server.

## Decision

- Add an authenticated completion endpoint separate from initialization and the
  direct R2 transfer.
- Repeat exact-origin and signed owner-session checks at both upload mutation
  endpoints.
- Inspect the opaque, database-owned object key with R2 `HeadObject` after the
  browser finishes its PUT.
- Require exact equality between R2 `Content-Length` / `Content-Type` and the
  approved PostgreSQL metadata before readiness.
- Require the signed upload to use `If-None-Match: *`, preventing the same
  presigned URL from replacing verified bytes while it remains valid.
- Transition with a conditional `PENDING` update rather than a read followed by
  an unconditional write.
- Make completion idempotent when the row is already `READY`.
- Leave an absent R2 object `PENDING` so a visibility delay can be retried.
- Mark mismatched uploads `FAILED` and late uploads `EXPIRED`, then attempt to
  delete their objects without exposing provider error details to the client.
- Keep object inspection and deletion behind an `ObjectStore` application port
  so the use case remains independent of Cloudflare and the AWS SDK.

## Consequences

PostgreSQL `READY` now means storage has independently reported the exact byte
count and media type approved during initialization. The future download use
case can require `READY` rather than trusting browser state.

Completion adds one R2 Class B metadata operation per upload and rejected files
may add a delete operation. These small control requests are preferable to
proxying file bytes through the application server.

A failed best-effort deletion can leave an unreachable object in R2. The error
tracks that cleanup remains pending internally, but the HTTP response remains
generic. Scheduled lifecycle cleanup must eventually reconcile stale
`PENDING`, `FAILED`, and `EXPIRED` rows with R2.

Exact content-type equality may reject a client that does not resend the
required signed header. This is intentional: the browser must use the headers
returned by initialization, and the UI does so automatically.
