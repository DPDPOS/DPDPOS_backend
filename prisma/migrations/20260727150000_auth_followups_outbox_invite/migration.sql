-- Invite acceptance tokens
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "invite_token_hash" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "invite_expires_at" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "users_invite_token_hash_idx" ON "users"("invite_token_hash");

-- Outbox claim locking / retry isolation
ALTER TABLE "outbox_events" ADD COLUMN IF NOT EXISTS "attempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "outbox_events" ADD COLUMN IF NOT EXISTS "locked_at" TIMESTAMP(3);
ALTER TABLE "outbox_events" ADD COLUMN IF NOT EXISTS "lock_token" TEXT;
ALTER TABLE "outbox_events" ADD COLUMN IF NOT EXISTS "available_at" TIMESTAMP(3);
ALTER TABLE "outbox_events" ADD COLUMN IF NOT EXISTS "last_error" TEXT;

CREATE INDEX IF NOT EXISTS "outbox_events_available_at_published_at_idx"
  ON "outbox_events"("available_at", "published_at");
