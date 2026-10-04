# FileDrop documentation

FileDrop is a self-hosted private file-transfer service with expiring share
links. It keeps file metadata in PostgreSQL and file bytes in a private
S3-compatible object store, so application servers never proxy large uploads or
downloads.

FileDrop provides an owner-authenticated upload workflow, direct Cloudflare
R2 transfers for files up to 3 GB, opaque public download links, configurable
expiry, automatic cleanup, download authorization statistics, and a responsive
owner management interface with recoverable links, confirmed manual expiry and
record deletion. The repository also includes structured diagnostic logs, production configuration
validation, browser security headers, CI, release checks, health monitoring,
smoke tests, and deployment and rollback documentation.

## Features

- Owner-only upload access with scrypt password verification and signed,
  `HttpOnly` sessions
- Direct-to-R2 uploads and short-lived download redirects
- PostgreSQL-backed metadata, lifecycle state, and download statistics
- Expiry choices from one hour to seven days with retryable scheduled deletion
- Responsive, keyboard-accessible owner interface
- English-default interface with browser-local Simplified and Traditional
  Chinese preferences
- Retrieve share links, manually expire files, and delete expired records with confirmation
- Owner-visible, privacy-filtered diagnostic logs with filters, pagination and JSONL export
- Unit, integration, and browser end-to-end test coverage
- Production guardrails for secrets, dependencies, migrations, and deployment

## Version 1.0 scope

- Owner-only uploads
- 3 GB decimal maximum file size
- Expiry options: 1 hour, 24 hours, 3 days, and 7 days
- Private Cloudflare R2 bucket with presigned upload/download URLs
- PostgreSQL metadata and lifecycle state
- Any PostgreSQL database and either the container or the Vercel deployment
  adapter. Storage sits behind provider-neutral ports, but the only adapter that
  ships targets Cloudflare R2

Running an instance requires operator-owned PostgreSQL, a private Cloudflare R2
bucket, deployment, DNS, and secret configuration; no
production credentials or user files are included in this repository.

## Release status

`v1.0.1` is the current stable source release of FileDrop. `main` has since
gained owner file management, owner-visible logs, interface language switching,
and the container deployment adapter; the next version number is not yet
assigned. See the [changelog](../CHANGELOG.md) for the tagged contents and the
[release checklist](deployment/release-checklist.md) for production rollout.

## Development

- [Development guide](development.md): requirements, local setup, owner
  authentication, R2, scheduled cleanup, database and quality commands
- [Browser E2E testing](testing/browser-e2e.md)
- [Commit security gate](security/commit-gate.md)

## Architecture and decisions

- [Architecture overview](architecture/README.md)
- [ADR 0001: Modular monolith](decisions/0001-modular-monolith.md)
- [ADR 0002: Direct object-storage transfer](decisions/0002-direct-object-storage-transfer.md)
- [ADR 0003: Owner-only uploads](decisions/0003-owner-only-upload.md)
- [ADR 0004: PostgreSQL file metadata](decisions/0004-postgresql-file-metadata.md)
- [ADR 0005: Secure upload initialization](decisions/0005-secure-upload-initialization.md)
- [ADR 0006: Cloudflare R2 presigned upload adapter](decisions/0006-cloudflare-r2-upload-adapter.md)
- [ADR 0007: Owner passphrase and signed sessions](decisions/0007-owner-passphrase-session.md)
- [ADR 0008: Verify stored objects before readiness](decisions/0008-verified-upload-completion.md)
- [ADR 0009: Resolve public downloads with short-lived redirects](decisions/0009-short-lived-download-redirect.md)
- [ADR 0010: Lease-based scheduled deletion](decisions/0010-lease-based-scheduled-deletion.md)
- [ADR 0011: Count authorized download handoffs](decisions/0011-authorized-download-statistics.md)
- [ADR 0012: Expose a bounded owner-only file catalog](decisions/0012-owner-file-catalog.md)
- [ADR 0013: Test the owner browser journey at deterministic boundaries](decisions/0013-browser-contract-e2e.md)
- [ADR 0014: Fail closed before production deployment](decisions/0014-production-deployment-guardrails.md)
- [ADR 0015: Separate public liveness from read-only smoke tests](decisions/0015-public-liveness-and-read-only-smoke-tests.md)
- [ADR 0016: Separate runtime and migration database connections](decisions/0016-separate-runtime-and-migration-database-connections.md)
- [ADR 0017: Recoverable owner links and confirmed file management](decisions/0017-owner-file-management.md)
- [ADR 0018: Portable standalone containers](decisions/0018-portable-standalone-containers.md)

## Deployment

- [Cloudflare R2 setup](deployment/cloudflare-r2.md)
- [Owner authentication setup](deployment/owner-authentication.md)
- [Scheduled cleanup setup](deployment/scheduled-cleanup.md)
- [VPS Docker deployment](deployment/vps-docker.md)
- [Vercel deployment runbook](deployment/production-readiness.md)
- [File management upgrade](deployment/file-management-upgrade.md)
- [Release checklist](deployment/release-checklist.md)

## Operations

- [Production monitoring and first response](operations/production-monitoring.md)
- [Diagnostic logs](operations/diagnostic-logs.md)

## Project

- [Changelog](../CHANGELOG.md)
- [Contribution guide](../CONTRIBUTING.md)
- [Private vulnerability reporting policy](../SECURITY.md)
