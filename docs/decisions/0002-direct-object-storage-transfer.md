# ADR 0002: Transfer file bytes directly through object storage

- Status: Accepted
- Date: 2026-08-23

## Context

Files can be as large as 3 GB. Proxying those bytes through a serverless HTTP
handler would create request-size, timeout, memory, and bandwidth problems.

## Decision

The API creates short-lived presigned URLs. Browsers upload to and download from
a private Cloudflare R2 bucket without receiving storage credentials.

## Consequences

- Application servers handle only control-plane requests and metadata.
- Storage credentials remain server-side and the R2 bucket remains private.
- CORS must allow only approved FileDrop origins.
- Basic download statistics count authorized download hand-offs, not completed
  byte transfers.
- The 3 GB v1.0 upload uses single PUT and must restart after a network failure.
  Multipart upload and resume are a planned follow-up.
