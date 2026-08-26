# Owner authentication setup

FileDrop's Day 5 authentication is intended for one owner. It does not create a
database user and it must not be shared with friends. The login page is `/login`.

## Required secrets

Configure these two values together in an ignored local `.env` file or the
deployment platform's encrypted environment settings:

```text
UPLOAD_PASSWORD_HASH=<FileDrop scrypt hash>
SESSION_SECRET=<independent random secret of at least 32 bytes>
```

Follow the hash and secret generation commands in the root README. Do not pass
the plaintext password as a command-line argument because process listings and
shell history can expose arguments. Never commit either configured value.

`APP_URL` must be the exact public origin. For example, production uses the
shape `https://filedrop.example.com`, without a route path. HTTPS causes the
server to set the `Secure` cookie attribute; production authentication must not
run over HTTP.

## Rotation

- To change the login passphrase, generate and deploy a new
  `UPLOAD_PASSWORD_HASH`.
- To revoke every existing session, generate and deploy a new `SESSION_SECRET`.
- To do both, update both values in one deployment and restart all application
  instances.

Do not log environment variables, login bodies, Cookie headers, or full request
headers. The API itself returns only generic error codes and never returns the
session token in JSON.

## Deployment verification

After deploying over HTTPS:

1. Visit `/login` and confirm an incorrect passphrase returns a generic failure.
2. Sign in with the owner passphrase and confirm `GET /api/auth/session` returns
   `{ "authenticated": true }`.
3. In browser developer tools, confirm `filedrop_owner_session` has `HttpOnly`,
   `Secure`, `SameSite=Strict`, `Path=/`, and an eight-hour expiry.
4. Clear the session and confirm the session endpoint returns false.
5. Confirm login and logout requests with a foreign `Origin` are rejected.

The session endpoint reports only whether the cookie is valid. It does not
authorize an upload by itself; protected routes must verify the session at their
own server boundary.
