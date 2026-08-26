# FileDrop architecture

FileDrop is a modular monolith: the React UI and HTTP API deploy together, while
the domain rules, PostgreSQL access, and object-storage integration remain
separate modules.

## System context

```text
Control path
Browser ──> owner authentication ──> Next.js route handlers ──> PostgreSQL
                                        │
                                        └── creates short-lived presigned URLs

File path
Browser ────────────────────────────> private Cloudflare R2 bucket

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

## Upload initialization boundary

```text
Untrusted HTTP body
        │ strict Zod shape validation
        ▼
InitializeUpload use case
        │ domain metadata policy
        ├──> UploadUrlProvider ──> short-lived HTTPS PUT authorization
        └──> FileRepository ─────> PENDING metadata + SHA-256 token hash
```

The 256-bit raw share token is returned once and is never persisted. Object keys
contain an opaque UUID rather than the user-controlled file name. Signed upload
URLs live for at most 15 minutes and are never stored. The Next.js upload route
is not published until the upload-completion boundary can verify the object that
R2 actually received.

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

`Content-Length` is deliberately not signed because browsers control that
header. Consequently, initialization validates the claimed size but does not
prove the stored object's size. A later upload-completion use case must call
`HeadObject`, compare the actual byte count and content type with PostgreSQL,
and delete or reject mismatches before changing `PENDING` to `READY`.

Presigned URLs are bearer credentials. They are returned to the initiating
browser only, never logged or persisted, and expire after 15 minutes. R2 API
credentials remain exclusively in the server environment.

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

The lifecycle begins in `PENDING` while a client uploads directly to R2. A later
upload-completion use case moves it to `READY`. Expiry and physical deletion are
separate states so a scheduled cleanup can safely retry object deletion:

```text
PENDING ──> READY ──> EXPIRED ──> DELETING ──> DELETED
    └──────────────> FAILED
```

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
