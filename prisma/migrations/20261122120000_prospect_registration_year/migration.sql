-- Âge de l'entreprise : année d'immatriculation / de fondation trouvée par l'IA (additif, sans perte)
ALTER TABLE "prospects" ADD COLUMN IF NOT EXISTS "registrationYear" INTEGER,
ADD COLUMN IF NOT EXISTS "registrationDate" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "registrationSource" TEXT,
ADD COLUMN IF NOT EXISTS "registrationEvidence" TEXT,
ADD COLUMN IF NOT EXISTS "registrationUrl" TEXT,
ADD COLUMN IF NOT EXISTS "registrationConfidence" TEXT,
ADD COLUMN IF NOT EXISTS "registrationCheckedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "prospects_registrationYear_idx" ON "prospects"("registrationYear");
CREATE INDEX IF NOT EXISTS "prospects_registrationCheckedAt_idx" ON "prospects"("registrationCheckedAt");
