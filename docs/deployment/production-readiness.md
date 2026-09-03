# Production deployment runbook

FileDrop supports a managed Vercel + Neon + Cloudflare R2 deployment. This
arrangement does not require maintaining a virtual server: Vercel runs the
Next.js application and daily scheduler, Neon runs PostgreSQL, and R2 stores
file bytes.

This document is an execution checklist, not a place to record real credentials.
Keep provider values only in their encrypted settings and an ignored local
`.env` when necessary.

## 1. Provision isolated production resources

1. Create a Neon project and database dedicated to FileDrop.
2. Copy both connection strings from Neon's **Connect** dialog:
   - enable connection pooling and save that URL as `DATABASE_URL` for runtime
     application queries;
   - disable connection pooling and save that URL as `DIRECT_URL` for Prisma
     migrations during deployment.
3. Keep the TLS parameters on both URLs, including `sslmode=require` or a
   stricter mode.
4. Create a private R2 bucket and a bucket-scoped Object Read & Write token by
   following [the R2 guide](cloudflare-r2.md).
5. Import the public GitHub repository into Vercel. Do not expose provider
   credentials to pull requests from forks.

Do not reuse the local Docker database password, an R2 token from another
project, or one database across production and untrusted preview deployments.

## 2. Configure production-only environment values

Add all of the following under Vercel's **Production** environment scope:

| Variable               | Production rule                                                                                 |
| ---------------------- | ----------------------------------------------------------------------------------------------- |
| `APP_URL`              | Exact public HTTPS origin, currently `https://filedrop.mikaela79.com`; no path or trailing data |
| `DATABASE_URL`         | Pooled Neon URL for runtime queries, containing credentials, database, and required TLS mode    |
| `DIRECT_URL`           | Direct Neon URL for Prisma migrations, containing credentials, database, and required TLS mode  |
| `SESSION_SECRET`       | Independent random value of at least 32 characters                                              |
| `UPLOAD_PASSWORD_HASH` | FileDrop scrypt hash generated from the private owner passphrase                                |
| `CRON_SECRET`          | A different random value of at least 32 characters                                              |
| `R2_ACCOUNT_ID`        | Cloudflare's 32-character account ID                                                            |
| `R2_ACCESS_KEY_ID`     | Bucket-scoped R2 access key ID                                                                  |
| `R2_SECRET_ACCESS_KEY` | Bucket-scoped R2 secret access key                                                              |
| `R2_BUCKET_NAME`       | Private production bucket name                                                                  |

Generate the owner hash and random secrets with the commands documented in the
[owner-authentication guide](owner-authentication.md) and
[scheduled-cleanup guide](scheduled-cleanup.md). Do not place a raw owner
passphrase in Vercel: only its scrypt hash belongs there.

Leave these variables unavailable to Preview and Development until those
environments have their own database, bucket, and credentials. FileDrop's
preview build will then fail safely instead of silently using production data.

## 3. Understand the deployment gate

The committed Vercel build command runs these steps in order:

```text
production environment validation
  -> Prisma Client generation
  -> committed database migrations through DIRECT_URL
  -> production Next.js build
  -> publish only after every step succeeds
```

The deployed application uses only pooled `DATABASE_URL` for normal queries.
Prisma CLI commands prefer `DIRECT_URL`; local development falls back to
`DATABASE_URL` when `DIRECT_URL` is absent so existing disposable environments
remain usable. Production validation requires both values and rejects loopback,
non-TLS, credential-free, or query-level host override URLs.

Run the same environment contract locally only when a complete non-production
fixture or a secure production shell is already configured:

```bash
pnpm deploy:check
```

The command prints only a pass/fail summary and rule names. It never prints
configuration values. `pnpm build` intentionally remains a separate local
command so localhost development continues to work.

Database migrations are durable even if a later build or release fails. Keep
production migrations additive and compatible with both the old and new
application during a deployment. Use an expand-and-contract sequence for future
column removals or incompatible changes.

## 4. Connect the domain and storage origin

1. Add `filedrop.mikaela79.com` to the Vercel project.
2. Create the exact DNS record Vercel requests and wait for TLS certificate
   issuance.
3. Set `APP_URL` to the same HTTPS origin and redeploy.
4. Configure the R2 bucket's PUT CORS allowlist with that origin. Remove
   localhost if production should be the only browser allowed to upload to this
   bucket.

R2 remains private. FileDrop authorizes uploads and downloads with temporary
signed URLs; a public bucket or public R2 development URL defeats that boundary.

## 5. Post-deployment smoke test

Start with the anonymous, non-mutating checks:

```bash
FILEDROP_SMOKE_BASE_URL=https://filedrop.mikaela79.com pnpm smoke:production
```

This verifies application liveness, public security headers, anonymous access
boundaries, and unknown-link handling without using credentials or changing
production state. See the
[production monitoring guide](../operations/production-monitoring.md) for its
exact scope and failure workflow.

Then use a small, disposable, non-sensitive file in a private browser window to
verify the state-changing sequence that an anonymous smoke test deliberately
cannot cover:

1. `/upload` redirects or prompts an unauthenticated visitor to sign in.
2. An incorrect owner passphrase returns a generic failure without internal
   details; the real owner passphrase signs in successfully.
3. Upload initialization succeeds, the browser PUT reaches R2, completion
   verifies the object, and a one-time `/d/<token>` link appears.
4. The share link downloads the correct bytes and filename without exposing a
   public bucket URL.
5. `/files` shows the upload and an incremented authorization count after the
   download handoff.
6. A manual authenticated cleanup invocation handles a deliberately expired
   disposable record, and the scheduled job appears in Vercel's Cron Jobs view.
7. Application logs contain no passphrase, session token, share token, presigned
   URL, database URL, or R2 credential.

Inspect the deployed response headers as well. The homepage should include
`Content-Security-Policy`, `Referrer-Policy: no-referrer`,
`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, and
`Strict-Transport-Security`. Confirm that the browser console reports no policy
violation during sign-in, upload, catalog navigation, or download.

Delete the disposable test file through the cleanup path when finished. Do not
upload personal documents merely to prove the deployment works.

## 6. Recovery and rollback

- If a release fails before publication, inspect the first failed gate and fix
  the setting, migration, or build; do not bypass the validator.
- If the published application regresses, promote the previous healthy Vercel
  deployment. This restores code, not database schema or R2 objects.
- If a credential may have appeared in logs, screenshots, Git, or chat, revoke
  or rotate it before investigating further. Removing text alone does not revoke
  access.
- If R2 deletion fails, preserve the PostgreSQL tombstone/retry state and rerun
  cleanup. Do not manually mark an object deleted while its bytes still exist.

After both smoke phases pass, record only the deployment URL, application
version, test time, and pass/fail result. Never record bearer links or provider
values in an issue or public repository.
