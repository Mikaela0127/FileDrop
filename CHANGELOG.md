# Changelog

All notable changes to FileDrop are documented in this file.

## [1.0.0] - 2026-09-02

The first stable source release of FileDrop.

### Added

- Owner authentication with scrypt password verification and signed sessions.
- Direct uploads to a private Cloudflare R2 bucket for files up to 3 GB.
- Opaque, expiring public download links backed by short-lived signed URLs.
- PostgreSQL metadata, lifecycle state, and download authorization statistics.
- Retryable scheduled expiry and physical object deletion.
- Responsive upload and owner activity interfaces with accessibility support.
- Unit, PostgreSQL integration, and Playwright browser test suites.
- Production environment validation, security headers, health checks, smoke
  tests, secret scanning, dependency auditing, and GitHub Actions CI.
- Deployment, monitoring, rollback, contribution, and vulnerability-reporting
  documentation.

### Deployment note

This release contains the application and its deployment configuration. Each
operator must provision and configure their own PostgreSQL database, private R2
bucket, deployment environment, DNS, and secrets before the service is live.

[1.0.0]: https://github.com/Mikaela0127/FileDrop/releases/tag/v1.0.0
