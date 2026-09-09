# File management upgrade

This upgrade keeps the existing application host, PostgreSQL, and private R2
bucket. No additional paid service is required. Do not run integration/E2E tests
against production.

The environment-variable and deployment steps below are written for the Vercel
adapter. For a container deployment, set the same variables in the runtime
environment file and apply them by rebuilding and recreating the container; see
[VPS Docker deployment](vps-docker.md).

## 1. Prepare the independent encryption key

Run this locally yourself. It prints a newly generated JSON keyring; treat the
entire output as a secret and do not paste it into chat, GitHub, or a screenshot.

```bash
node -e 'const {randomBytes}=require("node:crypto"); process.stdout.write(JSON.stringify({active:"v1",keys:{v1:randomBytes(32).toString("hex")}})+"\n")'
```

In Vercel → project → Environment Variables, add `SHARE_TOKEN_KEYRING` to the
appropriate environment. Paste the complete JSON, without additional shell
quotes. Keep a secure backup. Generate a separate key for preview/testing and
use isolated preview database/storage resources. Never reuse SESSION_SECRET,
CRON_SECRET, or any R2 credential as the encryption key.

Local `.env` users should wrap the JSON in single quotes; leave `.env.example`
empty. Restart the development server after changing configuration.

## 2. Review and deploy

1. Verify a recent database backup/recovery point and review the additive SQL
   migrations. They add two nullable file columns and a separate operational log
   table; no existing file is rewritten.
2. Configure the keyring **before** starting a deployment with this commit.
3. The existing Vercel build command runs `deploy:check`, generates Prisma,
   applies migrations through DIRECT_URL, then builds the application. Do not
   use `prisma migrate dev` or `db push` on production.
4. Check build output and deployment status, then run `pnpm smoke:production`
   with `FILEDROP_SMOKE_BASE_URL` set to the public HTTPS origin.

## 3. Owner acceptance check

Use a small non-sensitive disposable file:

- Upload, open File activity, retrieve and copy the share link. Refresh and
  retrieve again: it must be identical and download correctly.
- For an existing legacy file, cancel the replacement dialog first. Its old
  link must remain valid. Confirm replacement only when you intend to invalidate
  that old link; a previously issued short-lived R2 link may still work briefly.
- Cancel manual expiry once, then confirm it. Refresh: status is Expired and the
  manual timestamp is shown. The original scheduled timestamp remains unchanged.
  The share endpoint no longer authorizes new downloads.
- Wait until at least 30 minutes after file creation before physical deletion.
  Cancel Delete record once, then confirm. Verify the record disappears and the
  R2 object is gone. No production failure injection is needed.
- Check Logs for `files.share`, `files.expire`, and `files.remove`. Record any
  response's `X-Request-ID` when investigating a failure.
- Open File activity → View owner logs. Confirm the management events appear,
  try the severity/request ID filters, and download one displayed page. Anonymous
  access to `/api/owner/logs` must return 401. No historic platform logs are imported.

## Commit, push, and deployment

A local `git commit` only records the changes on your computer; it does not
change GitHub or the running service.

Whether a `git push` reaches the running service depends on the adapter. With
Vercel's Git integration enabled, pushing to the configured production branch
starts a build, applies the committed migrations via the current build command,
and promotes the deployment on success; other branches usually create previews
instead. A container deployment has no such link: pushing changes nothing until
someone builds a new image and runs the release gate. Either way, a local
repository cannot prove what the running service is doing — check the deployment
itself.

Configure `SHARE_TOKEN_KEYRING` before pushing this combined management update.
The new database-backed log viewer does not require another environment variable.
After deployment reaches Ready, reload an already-open browser tab to load the
new UI. Clicking Refresh logs reloads log data only; it does not deploy software.

Reference: [Vercel Git deployments](https://vercel.com/docs/git).

## Key rotation and rollback

To rotate normally, retain the old entries, add a freshly generated key under a
new id, and set `active` to that new id. New uploads use it; existing envelopes
continue to decrypt with the previous key. Do not remove an old key until no
retained file uses it. Suspected compromise requires a separate revocation plan;
selecting a new active key does not invalidate existing links or rewrite old data.

If deployment fails, keep the additive columns and roll back the application
through the deployment platform. Keep the keyring securely. Do not drop columns
or reset the database. Rollback cannot reverse confirmed deletion or manual
expiry, and an older application will not offer link recovery.

## Known boundaries

File activity still shows only the 50 newest retained records, not an all-time
archive. Deletion is irreversible and removes the record's download counters.
Expiry cannot forcibly interrupt a running download; the deletion safety buffer
does not prove every in-flight PUT has ended. Keep the bucket private, preserve
conditional upload headers, and consider a separately reviewed storage lifecycle
backstop for orphaned objects. This upgrade does not configure that rule for you.
