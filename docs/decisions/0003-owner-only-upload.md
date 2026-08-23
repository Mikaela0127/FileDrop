# ADR 0003: Restrict MVP uploads to the owner

- Status: Accepted
- Date: 2026-08-23

## Context

Download links are intentionally shareable, but an anonymous public upload
endpoint would expose storage and cost to abuse. Only the project owner needs to
upload during the initial test period.

## Decision

Protect upload pages and APIs with an owner session backed by a hashed
passphrase. Centralize upload authorization behind an application boundary.

## Consequences

- The upload capability is not public even though download links are shareable.
- Plaintext passwords are never stored or logged.
- Friend uploads later replace the authorization implementation with individual
  identities and revocable permissions without changing file use cases.
