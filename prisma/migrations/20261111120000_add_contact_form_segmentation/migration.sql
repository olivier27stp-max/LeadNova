-- Segmentation des prospects selon la présence d'un formulaire de contact sur leur site
ALTER TABLE "prospects" ADD COLUMN "contactFormStatus" TEXT;
ALTER TABLE "prospects" ADD COLUMN "contactFormProvider" TEXT;
ALTER TABLE "prospects" ADD COLUMN "competitorCrm" TEXT;
CREATE INDEX "prospects_contactFormStatus_idx" ON "prospects"("contactFormStatus");
CREATE INDEX "prospects_competitorCrm_idx" ON "prospects"("competitorCrm");

-- Variante de message pour les prospects sans formulaire
ALTER TABLE "campaigns" ADD COLUMN "emailSubjectNoForm" TEXT;
ALTER TABLE "campaigns" ADD COLUMN "emailBodyNoForm" TEXT;
