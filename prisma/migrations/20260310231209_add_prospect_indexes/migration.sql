-- CreateIndex
CREATE INDEX "prospects_source_idx" ON "prospects"("source");

-- CreateIndex
CREATE INDEX "prospects_contactType_idx" ON "prospects"("contactType");

-- CreateIndex
CREATE INDEX "prospects_email_idx" ON "prospects"("email");

-- CreateIndex
CREATE INDEX "prospects_createdAt_idx" ON "prospects"("createdAt");

-- CreateIndex
CREATE INDEX "prospects_companyName_idx" ON "prospects"("companyName");
