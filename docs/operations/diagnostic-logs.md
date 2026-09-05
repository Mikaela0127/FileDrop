# Diagnostic logs

## View inside the owner interface

Sign in, open File activity, and choose **View owner logs** (`/owner/logs`).
The page can filter by severity and exact request ID, expand safe details, page
through older entries, refresh the current filter, and download the displayed
page as JSONL. Each page contains at most 100 entries. Downloads contain only
that page, not the whole retained history. The API (`GET /api/owner/logs`) checks
the signed owner session before reading any rows, and all responses are uncached.

Sanitized application events are stored in a separate `operational_logs` table.
This starts with events generated after this deployment: existing Vercel history
is not imported. Deleting a file record does not delete its diagnostic history.
Ordinary successful page/session/download requests remain stdout-only; errors,
file-specific upload/management events, and cleanup summaries are persisted.
Merely viewing logs does not generate more stored logs.

The retention window is 7 days, with a maximum of 10,000 stored entries. Each
write batch prunes older/excess rows, and the existing cleanup job also prunes
expired logs. Old rows are excluded from reads immediately; physical expiry
deletion happens on the next write or scheduled cleanup. No extra secret or
external log-service account is needed, but database storage and query usage
increase and count toward your Neon plan.

Each observed request buffers at most 32 safe entries and awaits a best-effort
database write before returning, for at most 2 seconds. Failed writes trigger a
60-second per-process cooldown while stdout continues. Database transactions
have their own limits and an advisory lock isolates log pruning from concurrent
log writes. Logging failure does not reverse or fail successful file operations.
This is diagnostic storage, not guaranteed delivery or a tamper-proof audit ledger.

## What is recorded

API requests use a generated `X-Request-ID`, elapsed milliseconds, HTTP status,
fixed operation event, and deployment commit when available. Failures include a
controlled error category, a stack fingerprint, and numeric stack locations.
Management and cleanup events may include an internal file UUID. Match the
reference displayed by the UI to the JSON `requestId` in deployment logs.

No application log includes raw Error messages/causes, stack text, filenames,
share tokens, ciphertext, signed URLs, request headers/bodies, passwords, or
database/R2 credentials. This sacrifices some raw stack detail for privacy;
reproduce locally using the matching commit and operation when needed.

Client upload failures report only a fixed stage and optional file UUID through
an authenticated, same-origin endpoint with a 512-byte body limit and a bounded
per-process intake. React error boundaries provide retry UI and best-effort
reporting. An anonymous render failure, offline browser, hard process crash,
OOM, or platform timeout may not produce an application event. Check platform
runtime/build logs separately. Diagnostic events are not a durable audit trail.

## Platform fallback and sanitization

Open Vercel → FileDrop → Logs. Select Production and the incident time range.
Search for the response's `X-Request-ID`, or an event such as `upload.complete`.
The custom JSON request ID is distinct from Vercel's own platform RequestId.

Application JSON is written to stdout; inspect its `level` field or search for
the event rather than relying only on the platform's stderr/error filter.
Platform-generated logs can still include a request path or raw framework error.
Do not share raw exports, screenshots, or full `/d/...` paths publicly.

With the Vercel CLI already authenticated to the intended project, an example is:

```bash
mkdir -p logs
vercel logs --environment production --since 1h --json | pnpm -s logs:sanitize > logs/incident.log
```

This is a command for you to run; it does not install or connect a provider.
The sanitizer accepts application JSONL or Vercel JSONL whose `message` contains
an application JSON entry. It strips all non-allowlisted fields and omits provider
errors and unrecognized formats. Zero exported entries is not proof that no
errors occurred. Inspect the dashboard if the output format is different.

For an already-saved local JSONL export:

```bash
pnpm -s logs:sanitize < logs/raw.log > logs/incident.log
```

The `logs/` directory and `*.log` are ignored by Git. Review sanitized output
before sharing and retain it only as long as needed. Reports should include the
time/timezone, operation, sanitized request ID, deployment commit, browser,
expected result, and actual result; never attach the private file or link.

## Retention and cost

Owner-visible database logs follow the retention above. No new log service or paid dependency is introduced. Platform fallback retention is
limited: the [Vercel runtime log documentation](https://vercel.com/docs/logs/runtime)
currently lists one hour for Hobby. Capture an incident promptly; this is not
long-term log storage. Plan limits can change. For continuous archival or alerts,
choose a separately reviewed retention/export service later.

The command options follow the [Vercel CLI logs documentation](https://vercel.com/docs/cli/logs).
The upgrade does not authorize a paid add-on or configure a Log Drain.
