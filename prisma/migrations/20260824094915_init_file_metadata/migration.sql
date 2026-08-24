-- CreateEnum
CREATE TYPE "FileStatus" AS ENUM ('PENDING', 'READY', 'FAILED', 'EXPIRED', 'DELETING', 'DELETED');

-- CreateTable
CREATE TABLE "files" (
    "id" UUID NOT NULL,
    "share_token_hash" CHAR(64) NOT NULL,
    "object_key" VARCHAR(1024) NOT NULL,
    "original_name" VARCHAR(255) NOT NULL,
    "content_type" VARCHAR(255) NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "status" "FileStatus" NOT NULL DEFAULT 'PENDING',
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "uploaded_at" TIMESTAMPTZ(3),
    "download_count" INTEGER NOT NULL DEFAULT 0,
    "last_downloaded_at" TIMESTAMPTZ(3),
    "deleted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "files_size_bytes_check" CHECK ("size_bytes" > 0 AND "size_bytes" <= 3000000000),
    CONSTRAINT "files_download_count_check" CHECK ("download_count" >= 0),
    CONSTRAINT "files_share_token_hash_format_check" CHECK ("share_token_hash" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "files_share_token_hash_key" ON "files"("share_token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "files_object_key_key" ON "files"("object_key");

-- CreateIndex
CREATE INDEX "files_status_expires_at_idx" ON "files"("status", "expires_at");
