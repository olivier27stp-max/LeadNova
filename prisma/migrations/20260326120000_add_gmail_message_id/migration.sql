-- Add Gmail message ID for reply/bounce tracking via Gmail API
ALTER TABLE "email_activity" ADD COLUMN "gmailMessageId" TEXT;
CREATE INDEX "email_activity_gmailMessageId_idx" ON "email_activity"("gmailMessageId");
