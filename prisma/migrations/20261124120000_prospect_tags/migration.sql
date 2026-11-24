-- Tags de prospects : les tags sont définis dans Paramètres (app_settings.data.prospectTags),
-- chaque fiche garde la liste des identifiants de ses tags (additif, sans perte).
ALTER TABLE "prospects" ADD COLUMN IF NOT EXISTS "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
CREATE INDEX IF NOT EXISTS "prospects_tags_idx" ON "prospects" USING GIN ("tags");
