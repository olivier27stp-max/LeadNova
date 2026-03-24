-- Add company name validation fields
ALTER TABLE "prospects" ADD COLUMN "rawCompanyName" TEXT;
ALTER TABLE "prospects" ADD COLUMN "companyNameConfidence" DOUBLE PRECISION;
ALTER TABLE "prospects" ADD COLUMN "companyNameNeedsReview" BOOLEAN NOT NULL DEFAULT false;
