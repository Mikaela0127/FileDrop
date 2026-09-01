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
        ├── DownloadUrlProvider ─────────> at most five-minute GET URL
        └── DownloadStatisticsRepository ─> conditional count + latest time
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

After validating the temporary URL, the use case records the handoff before
disclosing the redirect. The statistics update conditionally requires the row
to remain `READY` and unexpired, so a concurrent cleanup transition wins safely:
FileDrop discards the undisclosed URL and returns an unavailable response. A
database error also prevents the handoff instead of silently undercounting it.

`downloadCount` uses PostgreSQL's atomic increment rather than an application
read-modify-write. `lastDownloadedAt` is advanced in the same transaction only
when the new authorization time is later, so out-of-order concurrent requests
cannot regress it. The statistic means "FileDrop issued a valid redirect," not
"R2 delivered every byte"; the direct-storage boundary provides no completion
callback or server-side byte stream to prove that stronger event.

The 307 response lets R2 send the bytes directly, preserving the same bandwidth
boundary as upload. It deliberately uses `no-store` so an intermediary does not
cache the temporary signed location, and `no-referrer` so the raw share path is
not forwarded to the R2 S3 endpoint. The private bucket has no public URL.

## Owner file catalog boundary

```text
GET /api/files + HttpOnly owner cookie
                  │ verify signed session
                  ▼
          ListOwnerFiles (limit 50)
                  │ OwnerFileCatalogRepository
                  ▼
        Prisma safe-column projection ──> PostgreSQL
                  │
                  ▼ no-store JSON
          /files responsive activity view
```

The browser's session check is not the authorization boundary. Every catalog
request independently verifies the signed `HttpOnly`, `SameSite=Strict` owner
cookie before querying PostgreSQL. Authentication or database failures return a
generic uncached response without infrastructure details.

The application use case fixes the first catalog window at 50 newest records so
the database query is never unbounded. The Prisma adapter selects only the
fields displayed by the page: identifier, original name, content type, size,
lifecycle status, creation and expiry times, and download statistics. It does
not select or serialize `share_token_hash` or `object_key`.

The page treats a due `PENDING` or `READY` row as effectively expired even if
the daily cleanup job has not persisted its lifecycle transition yet. This is a
presentation rule only; reads do not mutate lifecycle state. Aggregate cards
therefore describe only the currently loaded bounded window, not every historic
record.

Existing share links cannot be reconstructed in the catalog. Initialization
returns the raw 256-bit bearer token once, while PostgreSQL retains only its
one-way SHA-256 hash. Preserving that security property is more important than a
convenient "copy old link" action.

## Browser experience and verification boundary

```text
Desktop / mobile Chromium
        │ semantic roles + keyboard navigation
        ▼
Built Next.js owner UI
        │ browser-observed HTTP contracts
        ├── mocked same-origin owner APIs
        └── mocked presigned object PUT

Backend confidence remains separate:
Vitest application/HTTP tests + PostgreSQL repository integration tests
```

Day 11 treats accessibility as part of application behavior rather than visual
polish. Every page exposes a unique heading and title, a keyboard skip link
targets the single main landmark, status changes use live regions, focus moves
to the one-time upload result, and global focus indicators remain visible.
Motion-heavy transitions are suppressed when the operating system requests
reduced motion. File cards collapse to one-column metadata on narrow screens,
and the complete owner browser journey is checked at desktop and mobile
Chromium viewports without horizontal overflow.

The Playwright suite deliberately tests the built Next.js UI against
deterministic browser-network fixtures. It validates the requests emitted by the
UI, the signed-upload header contract supplied to the browser, clipboard output,
navigation, and rendered owner metadata. It does not claim to prove Prisma, JWT,
or R2 behavior; those boundaries have dedicated unit and integration tests.
Keeping provider calls out of pull-request CI prevents real credentials and
mutable cloud resources from entering an otherwise deterministic public-repo
test. Production R2, Neon, HTTPS, CORS, and cron remain explicit deployment smoke
tests.

## Production deployment boundary

```text
Encrypted provider settings
          │
          ▼
Production contract ── reject missing/insecure configuration
          │
          ▼
Prisma generate ──> migrate deploy ──> Next.js build ──> publish
                                              │
                               global browser security headers

GitHub dependency or Action update
          └──> pinned SHA + public CI + secret-history scan
```

Local development and production intentionally have different configuration
contracts. Localhost may use HTTP, local PostgreSQL, and absent cloud adapters.
The Vercel build requires an exact HTTPS origin, remote TLS-protected PostgreSQL,
complete owner/cleanup/R2 settings, and independent session and cleanup secrets.
Validation errors disclose rule names only, not supplied values.

The global header policy suppresses referrers so bearer share paths are not sent
to third parties, prevents framing and MIME sniffing, disables unused browser
capabilities, and constrains browser content/network sources. The CSP permits
the Cloudflare R2 HTTPS endpoint for direct PUTs. Its remaining inline-script
allowance is a documented static-rendering trade-off, not a substitute for
React escaping and input validation.

The deployment gate applies committed migrations before publication. A code
rollback does not reverse those durable database changes, so migrations must
remain backward compatible. Production credentials are scoped only to the
production environment; untrusted previews fail closed unless given isolated
resources.

## Scheduled cleanup boundary

```text
Vercel Cron ── GET + Bearer CRON_SECRET ──> CleanupExpiredFiles
                                                   │
                     PostgreSQL <── expire due + claim 100-row batch
                                                   │
                                      EXPIRED/FAILED ──> DELETING
                                                   │
                                             R2 DeleteObject
                                                   │
                                      success ──> DELETED
                                      failure ──> EXPIRED (retry)
```

Expiry authorization and physical deletion are deliberately separate. Public
downloads reject `expiresAt <= now` even before the scheduled job runs. The job
then marks due metadata, claims deletion candidates with conditional updates,
and deletes only opaque object keys read from PostgreSQL.

The `updatedAt` value written during `DELETING` is a 15-minute lease and fencing
value. The claim uses one atomic update-and-return operation, so the worker
receives the same lease value that it wrote. A second invocation cannot claim an
active lease, and an old invocation cannot finalize or release a row after a
newer worker has reclaimed it. If a process disappears, its stale lease becomes
eligible again. R2 deletion and the database update cannot form one distributed
transaction, so deletion is intentionally retryable; removing an already-absent
object is treated as a safe reconciliation operation.

`GET /api/cron/cleanup` uses a separate `CRON_SECRET`, compares a SHA-256 digest
of the supplied bearer value in constant time, and emits uncached generic errors.
The endpoint uses `GET` because Vercel Cron invokes configured paths with GET;
possession of the secret, not the HTTP verb, is the mutation authorization.

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

Day 9 writes the existing `download_count` and `last_downloaded_at` columns
through a dedicated application port. No schema migration is necessary. The
same Prisma adapter implements the general metadata, cleanup, and download
statistics ports, while each use case depends only on the narrow interface it
needs.

Day 10 reads a data-minimized projection through
`OwnerFileCatalogRepository`. It reuses the same Prisma adapter and existing
schema, but neither the application result nor the owner API contains object
storage identifiers or token hashes. No migration is required.

The lifecycle begins in `PENDING` while a client uploads directly to R2. Verified
completion moves it to `READY`. Expiry and physical deletion are separate states
so a scheduled cleanup can safely retry object deletion:

```text
PENDING ──> READY ──> EXPIRED ──> DELETING ──> DELETED
    ├──────────────> FAILED
    └──────────────> EXPIRED
```

The Day 6 upload transitions and Day 8 deletion transitions use conditional
`UPDATE` operations as compare-and-set boundaries. A delayed or duplicated
request cannot overwrite a terminal state or a newer deletion lease.

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
