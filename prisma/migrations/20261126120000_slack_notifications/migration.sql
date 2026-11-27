-- Notifications Slack des réponses positives (additif, sans perte).
ALTER TABLE "email_activity" ADD COLUMN IF NOT EXISTS "replyConfidence" DOUBLE PRECISION;
ALTER TABLE "email_activity" ADD COLUMN IF NOT EXISTS "replyMessageId" TEXT;

CREATE TABLE IF NOT EXISTS "slack_notifications" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "prospectId" TEXT,
    "campaignId" TEXT,
    "activityId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "lastError" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "slack_notifications_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "slack_notifications_workspaceId_dedupeKey_key" ON "slack_notifications"("workspaceId", "dedupeKey");
CREATE INDEX IF NOT EXISTS "slack_notifications_status_createdAt_idx" ON "slack_notifications"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "slack_notifications_workspaceId_prospectId_campaignId_idx" ON "slack_notifications"("workspaceId", "prospectId", "campaignId");

DO $$ BEGIN
  ALTER TABLE "slack_notifications" ADD CONSTRAINT "slack_notifications_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
