# FileDrop architecture

FileDrop is a modular monolith: the React UI and HTTP API deploy together, while
the domain rules, PostgreSQL access, and object-storage integration remain
separate modules.

## System context

```text
Control path
Browser ──> Next.js route handlers ──> PostgreSQL
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
src/app                         HTTP and UI delivery
src/modules/files/domain        File policies and lifecycle rules
src/modules/files/application   Upload, download, and cleanup use cases
src/modules/files/infrastructure Prisma and R2 adapters
src/lib                         Shared configuration and technical utilities
```

Route handlers must not contain Prisma queries or R2 SDK calls directly. They
validate HTTP input, invoke an application use case, and translate its result to
an HTTP response.

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
