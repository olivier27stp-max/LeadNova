-- Propriétaire / dirigeant trouvé par l'IA sur le site web
ALTER TABLE "prospects" ADD COLUMN IF NOT EXISTS "ownerName" TEXT;
ALTER TABLE "prospects" ADD COLUMN IF NOT EXISTS "ownerFirstName" TEXT;
ALTER TABLE "prospects" ADD COLUMN IF NOT EXISTS "ownerRole" TEXT;
ALTER TABLE "prospects" ADD COLUMN IF NOT EXISTS "ownerConfidence" TEXT;
ALTER TABLE "prospects" ADD COLUMN IF NOT EXISTS "ownerSourceUrl" TEXT;
ALTER TABLE "prospects" ADD COLUMN IF NOT EXISTS "ownerEvidence" TEXT;
ALTER TABLE "prospects" ADD COLUMN IF NOT EXISTS "ownerCheckedAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "prospects_ownerCheckedAt_idx" ON "prospects"("ownerCheckedAt");
