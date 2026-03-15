-- AlterTable
ALTER TABLE "campaigns" ADD COLUMN     "emailBody" TEXT,
ADD COLUMN     "emailSubject" TEXT;

-- AlterTable
ALTER TABLE "prospects" ADD COLUMN     "contactType" TEXT NOT NULL DEFAULT 'prospect';

-- CreateTable
CREATE TABLE "campaign_contacts" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "prospectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaign_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "campaign_contacts_campaignId_idx" ON "campaign_contacts"("campaignId");

-- CreateIndex
CREATE INDEX "campaign_contacts_prospectId_idx" ON "campaign_contacts"("prospectId");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_contacts_campaignId_prospectId_key" ON "campaign_contacts"("campaignId", "prospectId");

-- AddForeignKey
ALTER TABLE "campaign_contacts" ADD CONSTRAINT "campaign_contacts_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_contacts" ADD CONSTRAINT "campaign_contacts_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "prospects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
