-- Add snapshot of prospect IDs at schedule time
ALTER TABLE "scheduled_emails" ADD COLUMN "snapshotProspectIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
