-- Additive migration: existing links and file records remain valid.
ALTER TABLE "files"
  ADD COLUMN "share_token_ciphertext" TEXT,
  ADD COLUMN "manually_expired_at" TIMESTAMPTZ(3);
