-- CreateEnum
CREATE TYPE "ProspectStatus" AS ENUM ('NEW', 'ENRICHED', 'CONTACTED', 'REPLIED', 'QUALIFIED', 'NOT_INTERESTED');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED');

-- CreateTable
CREATE TABLE "prospects" (
    "id" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "industry" TEXT,
    "city" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "website" TEXT,
    "email" TEXT,
    "secondaryEmail" TEXT,
    "contactPageUrl" TEXT,
    "linkedinUrl" TEXT,
    "source" TEXT,
    "dateDiscovered" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "ProspectStatus" NOT NULL DEFAULT 'NEW',
    "leadScore" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prospects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_activity" (
    "id" TEXT NOT NULL,
    "prospectId" TEXT NOT NULL,
    "emailSubject" TEXT NOT NULL,
    "emailBody" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "openedAt" TIMESTAMP(3),
    "replyReceived" BOOLEAN NOT NULL DEFAULT false,
    "bounce" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "email_activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blacklist" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "domain" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blacklist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaigns" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "maxPerDay" INTEGER NOT NULL DEFAULT 30,
    "delayMinSeconds" INTEGER NOT NULL DEFAULT 120,
    "delayMaxSeconds" INTEGER NOT NULL DEFAULT 300,
    "sentToday" INTEGER NOT NULL DEFAULT 0,
    "lastSentAt" TIMESTAMP(3),
    "requireApproval" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "prospects_status_idx" ON "prospects"("status");

-- CreateIndex
CREATE INDEX "prospects_leadScore_idx" ON "prospects"("leadScore" DESC);

-- CreateIndex
CREATE INDEX "prospects_city_idx" ON "prospects"("city");

-- CreateIndex
CREATE UNIQUE INDEX "prospects_companyName_city_key" ON "prospects"("companyName", "city");

-- CreateIndex
CREATE INDEX "email_activity_prospectId_idx" ON "email_activity"("prospectId");

-- CreateIndex
CREATE INDEX "email_activity_sentAt_idx" ON "email_activity"("sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "blacklist_email_key" ON "blacklist"("email");

-- CreateIndex
CREATE UNIQUE INDEX "blacklist_domain_key" ON "blacklist"("domain");

-- AddForeignKey
ALTER TABLE "email_activity" ADD CONSTRAINT "email_activity_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "prospects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
