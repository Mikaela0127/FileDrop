# FileDrop v1.0 release checklist

This checklist separates source-release verification from the account-authorized
work required to operate FileDrop in production. Never paste completed secret
values into this file, a commit, an issue, or a deployment note.

## 1. Freeze and verify the release

- [ ] Start the disposable local PostgreSQL service with `pnpm db:up`.
- [ ] Apply committed migrations with `pnpm db:migrate:deploy`.
- [ ] Install the pinned dependencies and Playwright Chromium.
- [ ] Run `pnpm release:check` against only the local database.
- [ ] Review the complete diff and Git history for credentials and personal
      information that automated scanners may miss.
- [ ] Confirm GitHub Actions passes on the exact commit intended for release.

The release gate is deliberately local-only because integration tests create
and delete rows. Production configuration remains separately validated by
`pnpm deploy:check`, and production behavior remains separately checked by
`pnpm smoke:production`.

## 2. Provision the production boundary

Follow the detailed
[production deployment runbook](production-readiness.md) to create an isolated
Neon database, private Cloudflare R2 bucket, bucket-scoped storage credential,
and Vercel project. Store production values only in each provider's encrypted
settings.

- [ ] Use independent owner, session, cleanup, database, and storage secrets.
- [ ] Configure pooled `DATABASE_URL` for runtime and direct `DIRECT_URL` for
      migrations; require TLS on both.
- [ ] Keep production values unavailable to untrusted Preview deployments.
- [ ] Keep the R2 bucket private and allow browser PUT requests only from the
      exact FileDrop origin.
- [ ] Configure `filedrop.mikaela79.com`, verify DNS, and wait for valid TLS.
- [ ] Confirm the deployment gate applies migrations and builds without
      printing configuration values.

## 3. Prove the deployed system

- [ ] Run the anonymous `pnpm smoke:production` command.
- [ ] Use one small, disposable, non-sensitive file for the credentialed owner
      upload, download, catalog, statistics, expiry, and cleanup path.
- [ ] Confirm the daily cleanup invocation appears in Vercel.
- [ ] Confirm logs and browser tools contain no passphrase, cookie, bearer
      token, share token, presigned URL, database URL, or R2 credential.
- [ ] Remove the disposable object through FileDrop's cleanup path.

Record only the release commit, public URL, verification time, and pass/fail
result. Do not record a share link or provider value.

## 4. Publish and observe

- [ ] Enable GitHub Private Vulnerability Reporting and verify that the
      repository's **Report a vulnerability** form is available.
- [ ] Publish the verified source commit as a GitHub release.
- [ ] Record production rollout status separately from the source release.
- [ ] Observe Vercel, Neon, and R2 signals during the first real transfers.
- [ ] Follow the
      [monitoring and first-response guide](../operations/production-monitoring.md)
      for failures; rotate any credential that may have been disclosed.

Code rollback does not reverse a PostgreSQL migration or remove an R2 object.
Use the runbook's recovery guidance rather than deleting production state by
hand.
