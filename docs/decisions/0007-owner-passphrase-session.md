# ADR 0007: Use a scrypt owner passphrase and signed session cookie

- Status: Accepted
- Date: 2026-08-26

## Context

The MVP must let one owner upload without publishing anonymous storage access.
Introducing a user table, email verification, OAuth, or a hosted identity
provider would add account lifecycle work that the current single-owner use case
does not need. Storing a plaintext deployment password or sending it with every
upload request would be unsafe.

The design must remain replaceable when FileDrop later permits selected friends
to upload.

## Decision

- Store a versioned scrypt password hash in `UPLOAD_PASSWORD_HASH`; never store
  the plaintext passphrase.
- Use Node's built-in scrypt with `N=65536`, `r=8`, `p=1`, a random 16-byte salt,
  a 32-byte digest, and a 128 MiB memory ceiling.
- Permit at most two concurrent password derivations per Node process and return
  HTTP 429 when that capacity is occupied.
- After authentication, issue an HS256 JWT with fixed issuer, audience, subject,
  role, random UUID identifier, and an exact eight-hour lifetime.
- Store the token only in an `HttpOnly`, `SameSite=Strict`, path-wide cookie. Add
  `Secure` whenever `APP_URL` uses HTTPS.
- Require exact same-origin checks for login and logout, limit login JSON to
  2 KiB, return generic errors, and mark every response as non-cacheable.
- Keep password verification and session management behind application ports so
  a multi-user identity implementation can replace them later.

## Consequences

- The repository and deployment database contain neither a plaintext password
  nor a password hash; the deployment platform holds the hash as a secret.
- Signed JWT contents are readable but cannot be altered without the independent
  session secret, so the payload deliberately contains no sensitive metadata.
- Rotating `SESSION_SECRET` immediately invalidates every owner session. Rotating
  `UPLOAD_PASSWORD_HASH` changes future login credentials but does not revoke an
  already-issued session.
- Per-process KDF capacity limits resource use but do not stop attempts spread
  across multiple instances. Distributed rate limiting and security telemetry
  remain future hardening before uploads are opened to more people.
- A single shared passphrase cannot identify which friend uploaded a file.
  Friend uploads therefore require individual identities and revocable
  authorization rather than sharing the owner credential.
