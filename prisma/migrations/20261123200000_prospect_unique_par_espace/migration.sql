-- Une entreprise (nom + ville) est unique PAR espace de travail, plus globalement :
-- avant, une entreprise déjà présente dans un autre compte était refusée en silence à la découverte.
CREATE UNIQUE INDEX IF NOT EXISTS "prospects_workspaceId_companyName_city_key" ON "prospects"("workspaceId", "companyName", "city");
DROP INDEX IF EXISTS "prospects_companyName_city_key";
