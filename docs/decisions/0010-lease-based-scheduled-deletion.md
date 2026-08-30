# ADR 0010: Lease-based scheduled deletion

- Status: Accepted
- Date: 2026-08-30

## Context

FileDrop must make expired links unusable immediately and eventually remove the
corresponding bytes from private object storage. PostgreSQL and Cloudflare R2 do
not share a transaction. Scheduled functions may overlap, fail between the R2
request and database update, or stop after changing a row to `DELETING`.

The provisional Vercel deployment also needs an HTTP route that its managed Cron
service can invoke without an owner browser session.

## Decision

- Continue denying downloads from `expiresAt` in the request path, independent
  of cleanup timing.
- Expose `GET /api/cron/cleanup`, authenticated by a dedicated bearer
  `CRON_SECRET`. Vercel Cron uses GET and automatically supplies that header.
- Process at most 100 rows per invocation.
- Move due `PENDING` and `READY` records to `EXPIRED` before selecting physical
  deletion candidates. `FAILED` records are also eligible because rejected
  upload objects may still exist.
- Claim each `EXPIRED`, `FAILED`, or stale `DELETING` row with a conditional
  update-and-return operation to `DELETING`, keeping lease acquisition and the
  returned claim in one database statement.
- Reuse the claimed row's `updatedAt` as a 15-minute deletion lease and fencing
  value. Finalize or release the row only when that exact value still matches.
- Mark successful deletion as `DELETED` with `deletedAt`. Return a failed R2
  deletion to `EXPIRED`; if even that database operation fails, the stale lease
  makes the work reclaimable later.
- Keep tombstone metadata after physical deletion so lifecycle and later
  statistics remain explainable.

## Consequences

- Duplicate or overlapping scheduled requests do not normally issue duplicate
  deletes for the same active lease.
- A crash cannot permanently strand a row in `DELETING`.
- R2 deletion may be repeated when the first request succeeded but its response
  or the following PostgreSQL update failed. This is required reconciliation,
  not exactly-once delivery.
- On Vercel Hobby, the committed daily schedule means bytes may remain for about
  a day after links become inaccessible. A paid or external scheduler can call
  the same provider-neutral endpoint more frequently without changing the use
  case.
- `updatedAt` now also carries short-lived lease semantics while status is
  `DELETING`; a dedicated lease column can replace it if future workflows need
  richer audit or long-running processing.
