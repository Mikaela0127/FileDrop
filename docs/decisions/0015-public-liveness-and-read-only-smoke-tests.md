# ADR 0015: Separate public liveness from read-only production smoke tests

- Status: Accepted
- Date: 2026-09-02

## Context

Passing a build proves that FileDrop's source compiles against a valid-looking
configuration. It does not prove that DNS, TLS, Vercel routing, production
headers, anonymous authorization boundaries, Neon connectivity, or the deployed
R2 configuration work together after publication.

A single public health endpoint that queries every dependency would appear to
cover those risks, but it would also turn routine uptime polling into database
and object-storage load. Dependency details in its response could help an
attacker map the system. Marking the whole application unhealthy during a
temporary provider fault would also make it harder to distinguish application
delivery from a downstream failure.

## Decision

Expose `GET /api/health` as a minimal liveness contract. It returns only the
fixed service name and `ok` status with cache prevention. It does not query
PostgreSQL or R2 and does not disclose versions, regions, commit identifiers,
provider names, environment values, or error details.

Provide a separate operator-run production smoke command. The command accepts
only a public HTTPS origin, follows no redirects, sends no cookie or
authorization value, and performs only anonymous GET requests. It verifies the
health contract, homepage security headers, anonymous session behavior,
owner-catalog protection, cleanup authentication, and rejection of a freshly
generated unknown share token. Response bodies and upstream exception messages
are omitted from failures so operational output cannot accidentally copy a
secret-bearing provider error.

The automated smoke suite remains non-mutating. It does not sign in, upload,
download a real file, invoke cleanup with credentials, or create database rows.
The first release therefore still requires one explicit manual end-to-end test
with a small disposable non-sensitive file.

## Consequences

An uptime monitor can call the cheap health route without gaining infrastructure
details or creating dependency traffic. A successful health check means only
that the deployed Next.js application can answer; it does not prove Neon, R2,
cron, or owner authentication are healthy.

The smoke command detects more deployment wiring failures while preserving the
owner-only and bearer-link boundaries. Its unknown-download check performs a
read against production metadata and causes the R2 adapter to initialize, but a
256-bit random token makes a real-record collision negligible and no storage
authorization is returned.

Full upload, download, statistics, and deletion verification remains a manual
post-deployment task because safely automating it would require production
credentials and deliberate production mutations. A future isolated staging
environment can support that stronger automation without putting secrets or
mutable production data into public CI.
