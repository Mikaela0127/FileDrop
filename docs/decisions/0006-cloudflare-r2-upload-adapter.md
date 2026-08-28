# ADR 0006: Use a Cloudflare R2 presigned upload adapter

- Status: Accepted
- Date: 2026-08-25

## Context

The application layer defines an `UploadUrlProvider` and must remain independent
of a storage vendor. The first production deployment needs to upload files as
large as 3 GB without sending their bytes through a Next.js process. Browser
uploads also cannot safely receive permanent R2 credentials.

## Decision

- Implement the upload port with the official AWS SDK v3 because R2 exposes an
  S3-compatible API.
- Configure the client with Cloudflare's account endpoint and region `auto`.
- Keep the R2 bucket private and use a bucket-scoped Object Read & Write token.
- Presign a `PutObject` command for at most 15 minutes.
- Sign `Content-Type` explicitly and return the exact required header to the
  browser.
- Sign `If-None-Match: *` so a still-valid PUT URL cannot overwrite an object
  after completion verification.
- Do not sign `Content-Length`, which browser code cannot set reliably.
- Restrict object keys to FileDrop's opaque `objects/<UUID>` namespace.
- Validate the R2 account ID, bucket name, complete credential group, file size,
  object key, header value, and TTL before signing.
- Never persist or log R2 credentials or generated presigned URLs.
- Keep the public upload route disabled until owner authentication exists.

## Consequences

URL signing is a local cryptographic operation and can be unit tested without a
Cloudflare account or network request. Upload bytes travel directly from the
browser to R2, so the application host handles only authorization and metadata.

The client-supplied size used during initialization is not proof of the uploaded
object's size. Before a file becomes downloadable, a later completion use case
must inspect the R2 object with `HeadObject` and compare its byte count and
content type with the `PENDING` database record.

R2 supports a single PUT object up to 5 GiB, so the 3 GB MVP limit is technically
valid. A failed single PUT restarts from zero, however, and Cloudflare recommends
multipart upload for large files. Multipart upload remains a post-MVP reliability
improvement rather than changing today's application boundary.
