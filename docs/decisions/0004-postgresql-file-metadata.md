# ADR 0004: Persist file metadata in PostgreSQL

- Status: Accepted
- Date: 2026-08-24

## Context

FileDrop needs durable metadata for authorization, expiry, cleanup, and download
statistics. Binary objects can reach 3 GB and have different storage and transfer
requirements from relational metadata.

## Decision

Store file metadata and lifecycle state in PostgreSQL through a repository
interface. Store file bytes only in object storage. Persist a SHA-256 hash of the
share token instead of the bearer token itself.

Use a PostgreSQL `bigint` for byte size, timestamp-with-time-zone columns for
lifecycle events, and a composite index on status and expiry for cleanup scans.
Database constraints enforce the 3 GB size limit and non-negative download count.

## Consequences

- A leaked database does not directly reveal usable download links.
- Application code can test domain behavior without Prisma or PostgreSQL.
- Cleanup can efficiently find ready files whose expiry time has passed.
- Deleting metadata and deleting an R2 object remain separate operations that
  require an explicit lifecycle state.
