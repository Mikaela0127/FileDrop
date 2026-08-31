# ADR 0009: Resolve public downloads with short-lived redirects

- Status: Accepted
- Date: 2026-08-30

## Context

FileDrop share links contain a 256-bit bearer token. A download must reject
guessed, missing, incomplete, failed, deleted, and expired records without
making the private R2 bucket public. Proxying files of up to 3 GB through
Next.js would duplicate bandwidth, consume server connections, and reintroduce
the request limits avoided by direct upload.

The raw token and temporary R2 authorization are both credentials. They must
not be persisted, cached, included in referrers, or exposed in error details.

## Decision

- Implement `GET /d/<share-token>` as a dynamic Node.js route handler.
- Accept only the canonical base64url representation of a 32-byte token and
  query PostgreSQL with its SHA-256 hash.
- Treat missing and non-`READY` rows as unavailable; reject an expired row even
  when its R2 object still exists.
- Keep `GetObject` signing behind a provider-neutral `DownloadUrlProvider`
  application port.
- Cap each R2 authorization at five minutes and shorten it so it cannot outlive
  the FileDrop record.
- Request an attachment response with a sanitized ASCII fallback and encoded
  UTF-8 original file name.
- Return an uncached 307 redirect with `Referrer-Policy: no-referrer` instead of
  returning signed URLs in JSON or proxying object bytes.
- Return generic 404, 410, or 503 text without provider details or metadata.

## Consequences

The application remains the authorization and expiry authority while R2 serves
the large byte stream. A copied R2 URL can bypass FileDrop until that URL's
short expiry, so five minutes is a deliberate usability/security compromise.
Share links themselves remain valid until the file expires and must be treated
like passwords.

Top-level redirect downloads do not require browser CORS access. Presigned URLs
use the R2 S3 API hostname rather than `filedrop.mikaela79.com`; this is expected
for a private bucket and keeps application bandwidth independent of file size.

The redirect records authorization issuance rather than proof that a transfer
completed. Download statistics therefore remain a separate milestone and must
define their counting semantics explicitly.

ADR 0011 completes that follow-up by counting only validated, conditionally
recorded authorization handoffs.
