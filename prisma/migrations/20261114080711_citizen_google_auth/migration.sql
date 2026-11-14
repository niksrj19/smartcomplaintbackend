/*
  Warnings:

  - A unique constraint covering the columns `[google_sub]` on the table `citizens` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "citizens" ADD COLUMN     "avatar_url" TEXT,
ADD COLUMN     "google_sub" TEXT,
ADD COLUMN     "last_login_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "citizen_refresh_tokens" (
    "id" UUID NOT NULL,
    "citizen_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "family_id" UUID NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "citizen_refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "citizen_refresh_tokens_token_hash_key" ON "citizen_refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "citizen_refresh_tokens_citizen_id_idx" ON "citizen_refresh_tokens"("citizen_id");

-- CreateIndex
CREATE INDEX "citizen_refresh_tokens_family_id_idx" ON "citizen_refresh_tokens"("family_id");

-- CreateIndex
CREATE INDEX "chat_sessions_citizen_id_created_at_idx" ON "chat_sessions"("citizen_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "citizens_google_sub_key" ON "citizens"("google_sub");

-- AddForeignKey
ALTER TABLE "citizen_refresh_tokens" ADD CONSTRAINT "citizen_refresh_tokens_citizen_id_fkey" FOREIGN KEY ("citizen_id") REFERENCES "citizens"("id") ON DELETE CASCADE ON UPDATE CASCADE;
