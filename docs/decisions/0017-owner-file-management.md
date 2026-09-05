# ADR 0017: Recoverable owner links and confirmed file management

- Status: Accepted
- Date: 2026-09-05
- Partially supersedes ADR 0005 and ADR 0012's hash-only/recovery decisions.

## Decision

Keep the modular monolith and existing owner session. Add three small application
operations behind same-origin, authenticated HTTP handlers. No browser action
talks directly to PostgreSQL or receives an R2 API credential.

| Owner action          | Application operation                               | Persistence/storage effect                          |
| --------------------- | --------------------------------------------------- | --------------------------------------------------- |
| Get share link        | Authenticate, decrypt, verify hash                  | No change for recoverable files                     |
| Replace legacy link   | Confirm, generate random token, conditional update  | Exactly one new hash + ciphertext pair wins         |
| Expire file           | Confirm, conditionally transition READY → EXPIRED   | Record manual time; preserve scheduled expiry       |
| Delete expired record | Confirm, lease, delete R2, mark DELETED, remove row | Retain row on failure; cron may reclaim stale lease |

Tokens are encrypted using AES-256-GCM, a fresh 96-bit nonce, and an authentication
tag. Associated data binds the envelope version, key id, and object key. The
versioned JSON keyring is stored in the deployment environment, independently of
session and cleanup secrets. Download lookup still uses SHA-256 and needs no keyring.
The list endpoint exposes only a recovery-available boolean, never ciphertext.

Legacy hashes cannot be reversed. Explicit confirmation permits a one-time link
replacement. Conditional writes protect concurrent requests, which reread the
persisted winner. Missing keys or invalid ciphertext fail closed; no silent
rotation is performed. Losing encryption keys loses recovery, not existing public
download lookup. Keep old keys until all referencing files have been removed.

Manual expiry is logical revocation; existing R2 authorizations can last up to
five minutes, and already-running transfers may complete. Both scheduled and
manual deletion refuse newly created objects for 30 minutes: the 15-minute upload
grant lifetime plus a 15-minute buffer. This reduces delayed-upload races but is
not an absolute cancellation guarantee for an in-flight R2 request. An object
store lifecycle backstop/reconciliation remains advisable for long-term orphan
management. The application never claims it can revoke a running storage request.

The deletion lease uses the existing status and timestamp fence. Storage must be
deleted before the row; a failure after physical deletion remains retryable because
DeleteObject is idempotent. Deleting metadata removes per-file statistics; logs
are a separate diagnostic stream, not a durable, transactional audit ledger.

## Operational consequences

The schema change is additive and compatible with the preceding application.
New uploads need the independent keyring. A rollback keeps the added columns and
keys; it does not restore manually expired or deleted files. Application logs
use fixed events, request IDs, error classifications, hashed stack fingerprints,
and numeric stack coordinates. No raw errors or request data are serialized.
