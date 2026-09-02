# ADR 0005: Secure upload initialization

- Status: Accepted
- Date: 2026-08-24

## Context

The browser will eventually upload files directly to private object storage.
Before that transfer, FileDrop must validate untrusted metadata, create a
database record, and return two bearer credentials: a short-lived upload URL and
a long-lived share token. Accidentally storing or logging either credential
would make a private file accessible to unintended users.

The initial release also allows only the owner to upload. Publishing an upload
route before owner authentication exists would create an unauthenticated storage
and database abuse path.

## Decision

- The application service accepts only configured expiry values and files no
  larger than 3 GB decimal.
- File names are normalized and rejected if they contain path separators,
  control characters, bidirectional override characters, or more than 255 UTF-8
  bytes.
- MIME types are treated as untrusted metadata. Missing values become
  `application/octet-stream`; malformed values are rejected.
- Share tokens contain 256 bits of cryptographic randomness. Only their SHA-256
  hashes are persisted.
- Object keys use random UUIDs and never contain the original file name or share
  token.
- Upload authorizations are limited to HTTPS `PUT` URLs with no embedded
  username/password and a maximum lifetime of 15 minutes.
- URL creation and persistence are injected through ports. Cloudflare R2 and
  Prisma remain infrastructure details.
- The public Next.js upload route is deferred until owner authentication and the
  R2 adapter are both available.

## Consequences

The core upload flow can be tested now without R2 credentials, and later storage
providers can implement the same port. A generated URL may become unused if the
database write fails, but it is never returned and expires within 15 minutes.
The API must return the raw share token exactly once; losing it requires a new
upload in v1.0.
