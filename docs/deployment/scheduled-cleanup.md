# Scheduled cleanup deployment

FileDrop uses the application's existing Node.js deployment as a short-lived
cleanup worker. No continuously running server or separate queue is required in
v1.0: a scheduler sends an authenticated request, the function updates
PostgreSQL, and the same function deletes eligible R2 objects through its
scoped S3 credentials.

## Required production values

The deployment must already have runtime `DATABASE_URL`, migration `DIRECT_URL`,
and all four R2 variables. Add a separate `CRON_SECRET` with at least 32
characters:

```bash
openssl rand -hex 32
```

Store only the generated value in the deployment provider's encrypted
environment settings. Do not commit it, paste it into `vercel.json`, reuse any
other FileDrop credential, or put a real value in documentation or screenshots.

The R2 API token needs Object Read & Write access scoped to the FileDrop bucket;
Cloudflare documents deletion through its S3-compatible API in the
[R2 deletion guide](https://developers.cloudflare.com/r2/objects/delete-objects/).

## Vercel schedule

The committed `vercel.json` configures:

- path: `/api/cron/cleanup`
- schedule: daily at `03:00` UTC

Vercel sends an HTTP GET and, when the project has a `CRON_SECRET` environment
variable, automatically supplies `Authorization: Bearer <CRON_SECRET>`. This is
the mechanism described in Vercel's
[Cron security documentation](https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs).

The daily frequency deliberately works on the Hobby plan. Vercel currently
limits Hobby cron jobs to once per day with hour-level scheduling precision;
paid plans can use a more frequent expression. See the official
[Cron usage and pricing table](https://vercel.com/docs/cron-jobs/usage-and-pricing).

After configuring all environment values, redeploy so Vercel registers the cron
job. Verify it under the project's Cron Jobs settings and inspect its function
logs after the first run.

## Safe local verification

Start PostgreSQL and the app with a non-production R2 test bucket. With curl
8.3.0 or newer, read the local secret without echoing it and import it directly
from the environment so it does not appear in curl's process arguments:

```bash
read -rs "FILEDROP_CRON_SECRET?Local CRON_SECRET: "
printf '\n'
export FILEDROP_CRON_SECRET
curl --fail-with-body \
  --variable %FILEDROP_CRON_SECRET \
  --expand-header 'Authorization: Bearer {{FILEDROP_CRON_SECRET}}' \
  http://localhost:3000/api/cron/cleanup
unset FILEDROP_CRON_SECRET
```

Expected behavior:

- a missing or incorrect bearer token returns `401` and performs no cleanup;
- a successful run returns counts for expired, examined, claimed, deleted,
  failed, and skipped rows;
- any R2 deletion failure returns `503` with `Retry-After: 300` and leaves the
  row retryable;
- due download links already return `410` even if the daily physical deletion
  has not run.

Use only disposable test objects. R2 object deletion is irreversible; the
database keeps a `DELETED` tombstone, not a copy of the file bytes.

## Alternative scheduler

The cleanup use case and route do not depend on Vercel. Another trusted
scheduler may call the same HTTPS endpoint with the same bearer header. Keep the
secret out of URLs and query strings, keep the scheduler's execution timeout
comfortably below the 15-minute lease, and alert on non-2xx responses. If calls
overlap, the conditional claim and fencing value protect each row.
