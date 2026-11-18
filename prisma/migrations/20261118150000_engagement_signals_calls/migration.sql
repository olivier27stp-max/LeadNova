
-- AlterTable
ALTER TABLE "prospects" ADD COLUMN     "bookingTool" TEXT,
ADD COLUMN     "callbackAt" TIMESTAMP(3),
ADD COLUMN     "complaintCount" INTEGER,
ADD COLUMN     "complaintEvidence" TEXT,
ADD COLUMN     "currentTool" TEXT,
ADD COLUMN     "emailClickCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "emailOpenCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "employeeCount" INTEGER,
ADD COLUMN     "hiring" BOOLEAN,
ADD COLUMN     "hiringEvidence" TEXT,
ADD COLUMN     "lastCallAt" TIMESTAMP(3),
ADD COLUMN     "lastCallOutcome" TEXT,
ADD COLUMN     "lastCallWho" TEXT,
ADD COLUMN     "lastEngagedAt" TIMESTAMP(3),
ADD COLUMN     "lastObjection" TEXT,
ADD COLUMN     "lastReplySentiment" TEXT,
ADD COLUMN     "lastReviewAt" TIMESTAMP(3),
ADD COLUMN     "lastSiteVisitAt" TIMESTAMP(3),
ADD COLUMN     "lostReason" TEXT,
ADD COLUMN     "onlineBooking" BOOLEAN,
ADD COLUMN     "onlinePayment" BOOLEAN,
ADD COLUMN     "ownerRepliesReviews" BOOLEAN,
ADD COLUMN     "reviewsCheckedAt" TIMESTAMP(3),
ADD COLUMN     "reviewsLast6m" INTEGER,
ADD COLUMN     "reviewsSampleSize" INTEGER,
ADD COLUMN     "reviewsSource" TEXT,
ADD COLUMN     "salesStage" TEXT,
ADD COLUMN     "serviceSegment" TEXT,
ADD COLUMN     "siteAnalyzedAt" TIMESTAMP(3),
ADD COLUMN     "siteVisitCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "teamsCount" INTEGER,
ADD COLUMN     "teamsEvidence" TEXT;

-- AlterTable
ALTER TABLE "email_activity" ADD COLUMN     "clickCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "firstClickedAt" TIMESTAMP(3),
ADD COLUMN     "lastClickedAt" TIMESTAMP(3),
ADD COLUMN     "lastOpenedAt" TIMESTAMP(3),
ADD COLUMN     "openCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "repliedAt" TIMESTAMP(3),
ADD COLUMN     "replySentiment" TEXT,
ADD COLUMN     "replySnippet" TEXT;

-- CreateTable
CREATE TABLE "call_logs" (
    "id" TEXT NOT NULL,
    "prospectId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "outcome" TEXT NOT NULL,
    "whoAnswered" TEXT,
    "currentTool" TEXT,
    "employeeCount" INTEGER,
    "objection" TEXT,
    "callbackAt" TIMESTAMP(3),
    "notes" TEXT,

    CONSTRAINT "call_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "call_logs_prospectId_idx" ON "call_logs"("prospectId");

-- CreateIndex
CREATE INDEX "call_logs_workspaceId_createdAt_idx" ON "call_logs"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "prospects_siteAnalyzedAt_idx" ON "prospects"("siteAnalyzedAt");

-- CreateIndex
CREATE INDEX "prospects_callbackAt_idx" ON "prospects"("callbackAt");

-- AddForeignKey
ALTER TABLE "call_logs" ADD CONSTRAINT "call_logs_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "prospects"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Reprise de l'historique : les ouvertures déjà enregistrées comptent pour 1
UPDATE "email_activity" SET "openCount" = 1, "lastOpenedAt" = "openedAt" WHERE "openedAt" IS NOT NULL AND "openCount" = 0;
UPDATE "email_activity" SET "repliedAt" = "sentAt" WHERE "replyReceived" = true AND "repliedAt" IS NULL;
UPDATE "prospects" p
SET "emailOpenCount" = sub.opens, "lastEngagedAt" = sub.last_open
FROM (
  SELECT "prospectId", COUNT(*)::int AS opens, MAX("openedAt") AS last_open
  FROM "email_activity" WHERE "openedAt" IS NOT NULL GROUP BY "prospectId"
) sub
WHERE p.id = sub."prospectId";
