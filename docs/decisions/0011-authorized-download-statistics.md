# ADR 0011: Count authorized download handoffs

- Status: Accepted
- Date: 2026-08-31

## Context

FileDrop redirects a public bearer-link holder to a short-lived private R2 URL.
The application does not proxy file bytes, so it cannot prove that the browser
started or completed the transfer. The existing metadata schema already has
`downloadCount` and `lastDownloadedAt`, but concurrent requests, file expiry,
and cleanup transitions must not produce lost increments, regressed timestamps,
or redirects that bypass a failed statistics write.

## Decision

- Define one download as one valid R2 authorization that FileDrop records and
  hands off with an HTTP redirect. Do not describe it as a completed transfer.
- Validate the signed HTTPS URL and its lifetime before recording statistics.
- Record statistics before returning the redirect. If the write fails, do not
  disclose the signed URL; return the existing generic unavailable response.
- Conditionally require the file to remain `READY` with `expiresAt` later than
  the authorization time. A concurrent expiry or cleanup transition therefore
  prevents both the counter update and the handoff.
- Increment `downloadCount` atomically in PostgreSQL.
- In the same transaction, update `lastDownloadedAt` only when it is null or
  older than the new authorization time. This preserves the maximum timestamp
  even when concurrent requests finish out of order.
- Keep persistence behind a narrow `DownloadStatisticsRepository` application
  port. The Prisma adapter may implement that port alongside the other file
  repository contracts.
- Do not expose the counters through the public bearer-link route. The
  owner-only management view defined by ADR 0012 may read the stored metadata
  after independently verifying the signed owner session.

## Consequences

- Repeated link opens and retries that each receive a redirect are counted
  separately, even if the recipient cancels or R2 later fails to send bytes.
- Database availability is part of issuing a download authorization. This
  deliberately favors consistent statistics and lifecycle checks over allowing
  an uncounted handoff during a metadata outage.
- Generating an R2 URL before a failed conditional update is acceptable because
  the capability remains inside the server and is never returned to the caller.
- Atomic increments avoid lost updates, while monotonic timestamp updates make
  `lastDownloadedAt` meaningful under concurrency.
- No database migration is required because both columns and the non-negative
  counter constraint were created in the initial schema.
