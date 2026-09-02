# Production monitoring and first-response guide

Day 13 adds a minimal public liveness endpoint and a repeatable, anonymous
production smoke test. Neither mechanism needs an owner passphrase, session
cookie, cleanup secret, database URL, or R2 credential.

## Liveness endpoint

`GET /api/health` returns this fixed uncached response when the deployed Next.js
application can serve requests:

```json
{ "service": "filedrop", "status": "ok" }
```

It intentionally does not query Neon or R2. A `200` therefore means "the web
application answered", not "every file operation is healthy". This keeps an
uptime check cheap and prevents infrastructure details from becoming public.

Configure any future uptime monitor to:

- request `https://filedrop.mikaela79.com/api/health` at a modest interval such
  as five minutes;
- require HTTP `200` and the fixed JSON contract;
- alert only after two consecutive failures to reduce transient noise;
- never attach authentication, cookies, share links, or provider values.

An external monitoring service is optional for the MVP. The endpoint itself
adds no paid dependency.

## Anonymous post-deployment smoke test

After DNS and TLS are active, run:

```bash
FILEDROP_SMOKE_BASE_URL=https://filedrop.mikaela79.com pnpm smoke:production
```

The target must be an exact public HTTPS origin. The command refuses HTTP,
localhost, credentials, custom ports, paths, queries, and fragments. It follows
no redirects and performs only anonymous `GET` requests.

The six checks cover:

1. the fixed liveness response;
2. homepage delivery and production security headers;
3. an anonymous visitor remaining signed out;
4. owner file metadata remaining inaccessible;
5. the cleanup job rejecting a missing bearer secret;
6. an unknown random share token returning no download redirect.

This command does not upload, delete, log in, or print response bodies. Run it
after every production deployment. Keep the output only as pass/fail evidence;
it contains no deployment secret.

## What still requires a manual check

Use one small, disposable, non-sensitive file after the first deployment and
after changes to storage, database, authentication, CORS, or lifecycle code.
Follow the full sequence in the
[production deployment runbook](../deployment/production-readiness.md): sign in,
upload directly to R2, complete verification, download through the share link,
confirm statistics, expire the record, and verify cleanup.

Do not automate that state-changing path against production CI. It would require
long-lived production credentials and would continually create production rows
and objects. An isolated staging project is the appropriate future target for a
credentialed end-to-end monitor.

## Signals to review

Review these provider dashboards without copying sensitive values into issues:

| Signal             | Healthy indication                                | Investigate when                                               |
| ------------------ | ------------------------------------------------- | -------------------------------------------------------------- |
| Vercel application | Health and smoke checks pass                      | HTTP 5xx, timeouts, or failed deployments                      |
| Vercel cron        | Daily cleanup invocation appears                  | Scheduled run is missing or repeatedly non-2xx                 |
| Neon PostgreSQL    | Connections and storage remain within plan limits | Connection exhaustion, query errors, or unexpected growth      |
| Cloudflare R2      | Expected object count/storage and low error rate  | Signed operations fail or expired bytes keep growing           |
| FileDrop catalog   | Lifecycle and counts match recent owner activity  | Rows remain `PENDING`/`DELETING` beyond expected retry windows |

Never place a passphrase, session cookie, share token, presigned URL,
`Authorization` header, database URL, R2 credential, or environment dump in
logs, screenshots, public issues, or monitoring labels.

## First response to a failure

1. Run the anonymous smoke test and note only the first failed check and time.
2. Confirm whether the latest Vercel deployment and custom-domain TLS are ready.
3. If liveness passes but a protected boundary fails, inspect only the relevant
   provider's redacted logs and metrics.
4. If credentials may have appeared anywhere, revoke or rotate them before
   continuing the investigation.
5. Promote the previous healthy Vercel deployment for a code regression. Do not
   assume that this rolls back PostgreSQL migrations or removes R2 objects.
6. Preserve cleanup retry metadata when R2 deletion fails; do not manually claim
   that physical deletion completed.
