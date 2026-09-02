# ADR 0012: Expose a bounded owner-only file catalog

- Status: Accepted
- Date: 2026-08-31

## Context

FileDrop persists download authorization counters, but an owner needs a safe
way to review those values alongside file lifecycle metadata. The public
bearer-link route must not expose this information. A catalog query must also
avoid leaking storage identifiers or token hashes and must not become an
unbounded database read as the table grows.

The raw share token is deliberately returned only during upload initialization
and is never persisted. Consequently, an existing share URL cannot be recovered
from PostgreSQL without weakening the current bearer-token design.

## Decision

- Add an owner-authenticated `GET /api/files` endpoint and responsive `/files`
  page.
- Verify the signed owner session at the API boundary on every request. The UI
  may react to `401`, but it is not an authorization control.
- Put the list policy in a `ListOwnerFiles` application use case and cap the
  initial newest-first window at 50 records.
- Depend on a narrow `OwnerFileCatalogRepository` port.
- Make the Prisma adapter use an explicit safe-column projection. Do not select
  or serialize `shareTokenHash` or `objectKey`.
- Return uncached JSON with `Vary: Cookie`, `Referrer-Policy: no-referrer`, and
  generic authentication or availability errors.
- Present due `PENDING` and `READY` rows as effectively expired without mutating
  persistence during a read.
- Do not store raw share tokens or add a reconstructed-link feature. Continue to
  show the share URL only when upload initialization returns it.
- Reuse the existing metadata schema; the catalog requires no migration.

## Consequences

- The owner can review recent status, size, expiry, download count, and latest
  authorized handoff from desktop or mobile layouts.
- The API is data-minimized independently of the React page, so a future UI
  mistake cannot expose columns it never receives.
- The first version intentionally shows only the 50 newest records. Cursor
  pagination can be added when the private deployment needs older history.
- Summary values describe the loaded window rather than an all-time aggregate.
- Previously issued share links must be retained by the owner or recipient; the
  service cannot recover them from a one-way hash.
