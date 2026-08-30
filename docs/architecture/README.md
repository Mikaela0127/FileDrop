# FileDrop architecture

FileDrop is a modular monolith: the React UI and HTTP API deploy together, while
the domain rules, PostgreSQL access, and object-storage integration remain
separate modules.

## System context

```text
Control path
Browser ──> owner authentication ──> Next.js route handlers ──> PostgreSQL
                                        │                         ▲
                                        ├── creates upload URL    │
                                        └── inspects R2 metadata ─┘

File path
Browser ───── direct PUT / redirected GET ─────> private Cloudflare R2 bucket

Cleanup path
Scheduled job ──> file application service ──> PostgreSQL + R2
```

The application is the source of truth for authorization and expiry. R2 stores
file bytes only; PostgreSQL stores metadata and lifecycle state only.

## Module boundaries

```text
src/app                         Next.js route composition and UI delivery
src/modules/auth/application    Provider-neutral owner auth orchestration
src/modules/auth/delivery       Login/logout/session HTTP boundary
src/modules/auth/infrastructure scrypt and JOSE adapters
src/modules/files/domain        File policies and lifecycle rules
src/modules/files/application   Upload, download, and cleanup use cases
src/modules/files/delivery      Provider-neutral HTTP contracts
src/modules/files/infrastructure Prisma and R2 adapters
src/lib                         Shared configuration and technical utilities
```

Route handlers must not contain Prisma queries or R2 SDK calls directly. They
validate HTTP input, invoke an application use case, and translate its result to
an HTTP response.

## Owner authentication boundary

```text
Untrusted login JSON (maximum 2 KiB)
        │ strict shape + exact Origin validation
        ▼
OwnerAuthentication application service
        ├──> OwnerPasswordVerifier ──> bounded scrypt comparison
        └──> OwnerSessionManager ────> signed eight-hour JWT
                                          │
                                          ▼
                              HttpOnly + SameSite=Strict cookie
```

The deployment environment stores one scrypt password hash and one independent
session-signing secret. The passphrase and raw session token are never persisted
in PostgreSQL or returned in JSON. JWT payloads contain only fixed owner claims,
a random session identifier, and standard time claims; they contain no file or
personal metadata. HTTPS deployments also set `Secure` on the cookie.

Login and logout require an exact same-origin `Origin` header and reject an
explicitly cross-site Fetch Metadata header. Authentication errors are generic.
Each Node process permits at most two concurrent scrypt verifications so a burst
cannot allocate unbounded KDF memory. This is resource back-pressure, not a
distributed login rate limiter; rate limiting remains a later hardening task.

The application depends on `OwnerPasswordVerifier` and `OwnerSessionManager`
interfaces, rather than directly on scrypt or JWT code. A future account system
can replace those adapters without changing the file use cases. The signed
session proves authentication only; every upload route must still perform an
authorization check immediately before creating storage access.

## Verified upload boundary

```text
1. Authenticated metadata request (maximum 4 KiB)
   Browser ──> InitializeUpload
                 ├──> UploadUrlProvider ──> 15-minute HTTPS PUT authorization
                 └──> FileRepository ─────> PENDING row + SHA-256 token hash

2. Direct file path
   Browser ───────────────────────────────> private R2 object

3. Authenticated completion request
   Browser ──> CompleteUpload
                 ├──> ObjectStore ────────> HeadObject actual metadata
                 └──> FileRepository ─────> conditional PENDING → READY
```

The 256-bit raw share token is returned once and is never persisted. Object keys
contain an opaque UUID rather than the user-controlled file name. Signed upload
URLs live for at most 15 minutes and are never stored. Both mutation endpoints
repeat exact-origin and owner-session authorization checks; the `/upload` page's
session check is only a user-interface convenience.

The application never trusts the browser's successful PUT response as proof.
Completion reads `Content-Length` and `Content-Type` from R2 and compares them
with the approved PostgreSQL record. Only an exact match can use the conditional
repository transition from `PENDING` to `READY`. Repeated completion of an
already-ready file is idempotent. Concurrent transitions cannot overwrite a
terminal state.

The presigned PUT also requires `If-None-Match: *`. R2 accepts a write only when
the opaque key does not already exist, so the same 15-minute capability cannot
overwrite verified bytes after the row becomes `READY`.

If R2 does not yet expose the object, the row stays `PENDING` so completion can
be retried. A mismatch becomes `FAILED`; an upload completed after its file
expiry becomes `EXPIRED`. Those rejected objects are deleted on a best-effort
basis. A later cleanup worker must retry any failed physical deletion.

## Public download boundary

```text
GET /d/<raw-share-token>
        │ canonical 256-bit token validation
        ▼
ResolveDownload
        ├── SHA-256 ──> FileRepository ──> READY + unexpired metadata
        └── DownloadUrlProvider ─────────> at most five-minute GET URL
                                                │
                                                ▼ 307 + no-store + no-referrer
                                      Browser ──> private R2 object
```

The route never queries PostgreSQL with the raw bearer token. Malformed,
missing, and non-`READY` links receive no storage authorization; expired links
fail immediately even before the cleanup worker physically removes their R2
objects. Download authorization is always shorter than the remaining file
lifetime and requests `Content-Disposition: attachment` with a safely encoded
original file name.

The 307 response lets R2 send the bytes directly, preserving the same bandwidth
boundary as upload. It deliberately uses `no-store` so an intermediary does not
cache the temporary signed location, and `no-referrer` so the raw share path is
not forwarded to the R2 S3 endpoint. The private bucket has no public URL.

## R2 upload adapter

```text
InitializeUpload
      │ UploadUrlProvider port
      ▼
CloudflareR2UploadUrlProvider
      │ AWS Signature Version 4 (local computation; no R2 request)
      ▼
15-minute HTTPS PUT URL + required Content-Type header
```

The adapter uses the official AWS SDK against Cloudflare's S3-compatible
endpoint with region `auto`. Its server-only composition factory receives the
four validated R2 environment variables. The bucket name and opaque object key
scope each `PutObject` command, while `Content-Type` is included in the signed
headers so the browser must send the exact value that the application approved.
`If-None-Match: *` is signed as well, making each opaque key single-write.

`Content-Length` is deliberately not signed because browsers control that
header. Consequently, initialization validates the claimed size while the
completion use case independently proves the stored byte count with
`HeadObject`. The R2 object adapter also supports scoped deletion of rejected
opaque keys.

Presigned URLs are bearer credentials. Upload authorizations are returned to the
initiating browser only and expire after 15 minutes; download authorizations are
returned only in an uncached redirect and expire after at most five minutes.
Neither is persisted. R2 API credentials remain exclusively in the server
environment.

## Persistence boundary

```text
File use case
    │
    ▼
FileRepository interface       domain-friendly numbers and lifecycle values
    │
    ▼
PrismaFileRepository           maps number ↔ PostgreSQL bigint
    │
    ▼
PostgreSQL                     constraints, indexes, durable metadata
```

The initial `files` table stores identifiers, a SHA-256 share-token hash, the R2
object key, user-visible metadata, lifecycle timestamps, and download counters.
The raw share token and file bytes are never stored in PostgreSQL.

The lifecycle begins in `PENDING` while a client uploads directly to R2. Verified
completion moves it to `READY`. Expiry and physical deletion are separate states
so a scheduled cleanup can safely retry object deletion:

```text
PENDING ──> READY ──> EXPIRED ──> DELETING ──> DELETED
    ├──────────────> FAILED
    └──────────────> EXPIRED
```

The Day 6 repository methods implement these initial transitions with an
`UPDATE ... WHERE status = PENDING` condition. This is a compare-and-set
boundary: a delayed or duplicated request cannot change a file after another
request has already moved it out of `PENDING`.

The `(status, expires_at)` index supports cleanup scans. PostgreSQL check
constraints independently enforce the 3 GB limit, non-negative statistics, and
the SHA-256 token-hash format.

Server environment variables are parsed once when each Next.js Node server
instance starts. Invalid application or database URLs prevent the instance from
accepting requests; optional secret groups are validated as soon as they are
configured.

## Confirmed MVP constraints

- Only the owner can upload.
- A single file is limited to 3,000,000,000 bytes (3 GB decimal).
- Uploads use a single presigned PUT request in the MVP.
- Failed uploads restart from the beginning; multipart resume is deferred.
- Files expire after 1 hour, 24 hours, 3 days, or 7 days.
- Download links use cryptographically random, non-sequential tokens.
- An expired file becomes inaccessible immediately, even if physical deletion
  runs later.

See `docs/decisions` for the reasoning and trade-offs behind these constraints.
