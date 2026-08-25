# Cloudflare R2 setup

Day 4 does not require real Cloudflare credentials. The adapter and its signing
tests run locally with obviously fake values and make no R2 network request.
Create the production resources only when you are ready to run an end-to-end
upload test.

## 1. Create a private bucket

In Cloudflare R2, create a bucket with a lowercase name containing only letters,
numbers, and internal hyphens. Keep public development URLs and custom-domain
public access disabled. FileDrop grants access with short-lived presigned URLs.

The application currently uses Cloudflare's default jurisdiction endpoint. If a
future deployment needs an EU or FedRAMP jurisdictional bucket, endpoint support
must be added and tested explicitly rather than changing the account ID value.

## 2. Create least-privilege credentials

Create an R2 API token with **Object Read & Write** permission, scoped to this
single bucket. Record the access key ID and secret access key when Cloudflare
shows them. Do not paste them into source files, documentation, chat messages,
issues, commits, or screenshots.

Add these values only to an ignored local `.env` file:

```dotenv
R2_ACCOUNT_ID=replace-with-your-32-character-account-id
R2_ACCESS_KEY_ID=replace-with-your-access-key-id
R2_SECRET_ACCESS_KEY=replace-with-your-secret-access-key
R2_BUCKET_NAME=replace-with-your-private-bucket-name
```

Use the same four variable names in the production application's encrypted
environment-variable settings. Restart or redeploy the application after
changing them because the server validates and caches configuration at startup.

## 3. Configure browser CORS

Apply this CORS policy to the bucket during development. Remove the localhost
origin from the production policy after deployment if local testing against the
production bucket is no longer needed.

```json
[
  {
    "AllowedOrigins": [
      "http://localhost:3000",
      "https://filedrop.mikaela79.com"
    ],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["Content-Type"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

CORS is browser enforcement, not authentication. The bucket must remain private,
the API must authenticate the owner before issuing an upload URL, and the URL
itself must be treated as a temporary bearer credential.

## 4. End-to-end checks for the authenticated route milestone

Once owner authentication and the upload/completion routes exist, verify all of
the following before deploying:

- an authenticated owner can upload with the returned `Content-Type` header;
- an unauthenticated request cannot obtain an upload URL;
- a different content type makes R2 reject the signed request;
- an expired URL no longer uploads;
- the completion flow rejects an R2 object whose actual size differs from the
  PostgreSQL record;
- credentials and presigned URLs do not appear in application logs or errors;
- the bucket has no public-access URL enabled.
