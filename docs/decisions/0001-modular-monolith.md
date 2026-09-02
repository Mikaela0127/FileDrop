# ADR 0001: Use a modular Next.js monolith

- Status: Accepted
- Date: 2026-08-23

## Context

FileDrop v1.0 needs a responsive UI, a small HTTP API, PostgreSQL metadata,
object storage integration, and a scheduled cleanup operation. Deploying
independent frontend and backend services would add operational work without
creating a useful boundary at this scale.

## Decision

Build one Next.js application, while separating delivery, application, domain,
and infrastructure code inside the repository.

## Consequences

- UI and API share one deployment and TypeScript toolchain.
- Domain code remains testable without Next.js, Prisma, or R2.
- A background worker can be extracted later if cleanup or file processing grows.
- Module boundaries require review discipline because the compiler cannot enforce
  every architectural rule.
