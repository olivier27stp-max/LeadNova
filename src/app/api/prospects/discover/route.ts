import { NextResponse, NextRequest } from "next/server";
import { discoverProspects, loadTargetingSettings, clearQueryLog } from "@/lib/discovery";
import { getDiscoveryProgress, setDiscoveryProgress, updateDiscoveryProgress, requestCancelDiscovery, isCancelRequested } from "@/lib/discovery-progress";
import { logActivity, generateBatchId } from "@/lib/activity";
import { runAgeTargetingForBatch } from "@/lib/age-targeting";
import { getWorkspaceContext } from "@/lib/workspace";
import { prisma } from "@/lib/db";

export async function GET() {
  // Progression de l'espace de travail actif seulement
  const ctx = await getWorkspaceContext();
  const progress = getDiscoveryProgress(ctx?.workspaceId ?? null);
  return NextResponse.json(progress || { status: "idle" });
}

export async function DELETE(request: NextRequest) {
  const ctx = await getWorkspaceContext();
  // ?memory=1 : oublier les recherches déjà faites (la prochaine découverte les refait toutes)
  if (request.nextUrl.searchParams.get("memory") === "1") {
    if (!ctx) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    await clearQueryLog(ctx.workspaceId);
    await logActivity({
      workspaceId: ctx.workspaceId,
      action: "settings_updated",
      type: "info",
      title: "Mémoire des recherches effacée",
      details: "La prochaine découverte refera toutes les recherches Google Maps",
    });
    return NextResponse.json({ cleared: true });
  }
  requestCancelDiscovery(ctx?.workspaceId ?? null);
  return NextResponse.json({ cancelled: true });
}

export async function POST(request: NextRequest) {
  const ctx = await getWorkspaceContext();
  const workspaceId = ctx?.workspaceId ?? null;

  const body = await request.json();
  const { city, industry, targetCount, campaignId } = body;
  const target = Math.max(1, targetCount || 10);

  try {
    // Helper: add discovered prospects to a campaign
    async function addProspectsToCampaign(batchId: string, campaignId: string) {
      if (!campaignId) return 0;
      // Avant : toute erreur était prise pour un doublon et ignorée → 0 ajouté sans aucune trace
      try {
        const campaign = await prisma.campaign.findFirst({
          where: { id: campaignId, workspaceId: workspaceId ?? null },
          select: { id: true, number: true, name: true },
        });
        if (!campaign) {
          console.error(`[discover] campagne ${campaignId} introuvable dans le compte ${workspaceId}`);
          await logActivity({
            workspaceId: workspaceId ?? undefined,
            action: "discovery_error",
            type: "error",
            title: "Découverte : campagne introuvable",
            details: "Les nouveaux prospects n'ont pas pu être ajoutés à la campagne choisie (supprimée ?)",
            metadata: { campaign_id: campaignId, batch_id: batchId },
          });
          return 0;
        }
        const prospects = await prisma.prospect.findMany({
          where: { importBatchId: batchId, workspaceId: workspaceId ?? null, archivedAt: null },
          select: { id: true },
        });
        if (prospects.length === 0) return 0;
        const { count } = await prisma.campaignContact.createMany({
          data: prospects.map((p) => ({ campaignId: campaign.id, prospectId: p.id })),
          skipDuplicates: true,
        });
        await logActivity({
          workspaceId: workspaceId ?? undefined,
          action: "campaign_contacts_added",
          type: "success",
          title: `Découverte : ${count} prospect(s) ajouté(s) à la campagne`,
          details: `#${campaign.number} ${campaign.name}`,
          relatedEntityType: "campaign",
          relatedEntityId: campaign.id,
          importBatchId: batchId,
          metadata: { campaign_id: campaign.id, batch_id: batchId, added: count, batch_size: prospects.length },
        });
        return count;
      } catch (error) {
        console.error("[discover] ajout à la campagne échoué:", error);
        await logActivity({
          workspaceId: workspaceId ?? undefined,
          action: "discovery_error",
          type: "error",
          title: "Découverte : ajout à la campagne échoué",
          details: error instanceof Error ? error.message : "Erreur inconnue",
          metadata: { campaign_id: campaignId, batch_id: batchId },
        });
        return 0;
      }
    }

    // Ajoute les nouveaux prospects du lot à la campagne choisie, côté serveur (même si la page est fermée).
    // Ciblage par âge : cherche d'abord leur année, puis n'ajoute que ceux qui ont l'âge voulu.
    async function addToCampaignAfterDiscovery(newCount: number): Promise<{ addedToCampaign: number; ageMatched: number | null }> {
      if (!campaignId || newCount === 0) return { addedToCampaign: 0, ageMatched: null };
      if (!targeting.companyAge || !workspaceId) {
        return { addedToCampaign: await addProspectsToCampaign(batchId, campaignId), ageMatched: null };
      }
      updateDiscoveryProgress(workspaceId, { filterPhase: "Recherche de l'année des nouveaux prospects..." });
      try {
        const res = await runAgeTargetingForBatch({
          workspaceId,
          batchId,
          campaignId,
          companyAge: targeting.companyAge,
          onProgress: (done, total) =>
            updateDiscoveryProgress(workspaceId, { filterPhase: `Recherche de l'année des nouveaux prospects... (${done}/${total})` }),
          isCancelled: () => isCancelRequested(workspaceId),
        });
        return { addedToCampaign: res?.added ?? 0, ageMatched: res?.matched ?? null };
      } catch (error) {
        console.error("[discover] ciblage par âge échoué:", error);
        return { addedToCampaign: 0, ageMatched: null };
      }
    }

    // Helper: increment discovery usage counter
    async function incrementDiscoveryUsage(count: number) {
      try {
        const row = await prisma.appSettings.findFirst({ where, select: { id: true, data: true } });
        if (!row) return;
        const data = (row.data as Record<string, unknown>) || {};
        const sub = (data.subscription as Record<string, unknown>) || {};
        const periodStartVal = sub.currentPeriodStart as string | undefined;
        const nowDate = new Date();
        const pDate = periodStartVal ? new Date(periodStartVal) : null;
        const newMonth = !pDate || pDate.getMonth() !== nowDate.getMonth() || pDate.getFullYear() !== nowDate.getFullYear();
        const prevUsed = newMonth ? 0 : ((sub.discoveriesUsedThisMonth as number) || 0);
        await prisma.appSettings.update({
          where: { id: row.id },
          data: {
            data: {
              ...data,
              subscription: {
                ...sub,
                discoveriesUsedThisMonth: prevUsed + count,
                currentPeriodStart: newMonth ? nowDate.toISOString() : (periodStartVal || nowDate.toISOString()),
              },
            },
          },
        });
      } catch { /* silent */ }
    }

    // Load settings (targeting + subscription)
    const targeting = await loadTargetingSettings(workspaceId);
    const settingsCities = targeting.cities;

    // Check subscription discovery limit
    const where = workspaceId ? { workspaceId } : { workspaceId: null };
    const settingsRow = await prisma.appSettings.findFirst({ where, select: { data: true } });
    const settingsData = (settingsRow?.data as Record<string, unknown>) || {};
    const subscription = (settingsData.subscription as Record<string, unknown>) || {};
    const maxDiscoveries = (subscription.maxDiscoveriesPerMonth as number) || 5000;
    const usedDiscoveries = (subscription.discoveriesUsedThisMonth as number) || 0;
    const periodStart = subscription.currentPeriodStart as string | undefined;

    // Reset counter if new month
    const now = new Date();
    const periodDate = periodStart ? new Date(periodStart) : null;
    const isNewMonth = !periodDate || periodDate.getMonth() !== now.getMonth() || periodDate.getFullYear() !== now.getFullYear();
    const currentUsed = isNewMonth ? 0 : usedDiscoveries;

    if (currentUsed >= maxDiscoveries) {
      return NextResponse.json(
        { error: `Limite de découvertes atteinte (${maxDiscoveries.toLocaleString()}/mois). Passez à un plan supérieur dans Paramètres > Plans et tarifs.` },
        { status: 429 }
      );
    }

    // Cap target to remaining allowance
    const remaining = maxDiscoveries - currentUsed;
    const maxToFind = Math.min(target, remaining);

    if (city === "all" && settingsCities.length === 0) {
      return NextResponse.json(
        { error: "Aucune ville configurée dans Ciblage. Allez dans Paramètres > Ciblage pour ajouter des villes." },
        { status: 400 }
      );
    }

    if (city !== "all" && !city) {
      return NextResponse.json({ error: "City is required" }, { status: 400 });
    }

    // Une seule découverte à la fois par espace de travail (vérifié juste avant de démarrer, sans await entre les deux)
    if (getDiscoveryProgress(workspaceId)?.status === "running") {
      return NextResponse.json(
        { error: "Une découverte est déjà en cours pour cet espace de travail. Attendez qu'elle se termine ou arrêtez-la." },
        { status: 409 }
      );
    }

    // Initialize progress tracking
    const totalCities = city === "all" ? settingsCities.length : 1;
    setDiscoveryProgress(workspaceId, {
      status: "running",
      target: maxToFind,
      found: 0,
      newCount: 0,
      filteredOut: 0,
      filterPhase: "",
      currentCity: city === "all" ? settingsCities[0] || "" : city,
      round: 1,
      startedAt: Date.now(),
      totalCities,
      completedCities: 0,
    });

    const batchId = generateBatchId();

    // La recherche tourne en arrière-plan : une découverte « toutes les villes » dure plusieurs
    // minutes et Railway coupe les requêtes HTTP trop longues (« upstream error »).
    // La page suit la progression par GET et lit le résultat final dans progress.result.
    const runJob = async (): Promise<Record<string, unknown>> => {
    try {
      if (city === "all") {
        // Loop through cities multiple rounds until target is reached
        let totalFound = 0;
        let totalNew = 0;
        let totalQueriesAttempted = 0;
        let totalQueriesWithResults = 0;
        let totalQueriesFailed = 0;
        let totalQueriesSkipped = 0;
        const allErrors: string[] = [];
        let rounds = 0;
        // Avec Outscraper, un 2e tour relance exactement les mêmes requêtes (coût en double, mêmes résultats)
        const maxRounds = process.env.OUTSCRAPER_API_KEY ? 1 : 20;

        while (totalNew < maxToFind && rounds < maxRounds) {
          if (isCancelRequested(workspaceId)) break;
          rounds++;
          const newBeforeRound = totalNew;
          updateDiscoveryProgress(workspaceId, { round: rounds });

          for (const targetCity of settingsCities) {
            if (totalNew >= maxToFind || isCancelRequested(workspaceId)) break;

            updateDiscoveryProgress(workspaceId, { currentCity: targetCity });

            const batchMax = maxToFind - totalNew;
            const result = await discoverProspects(targetCity, undefined, batchMax, batchId, workspaceId);

            totalFound += result.found;
            totalNew += result.new;
            totalQueriesAttempted += result.diagnostics.queriesAttempted;
            totalQueriesWithResults += result.diagnostics.queriesWithResults;
            totalQueriesFailed += result.diagnostics.queriesFailed;
            totalQueriesSkipped += result.diagnostics.queriesSkipped ?? 0;
            allErrors.push(...result.diagnostics.errors);

            updateDiscoveryProgress(workspaceId, { found: totalFound, newCount: totalNew, completedCities: (getDiscoveryProgress(workspaceId)?.completedCities || 0) + 1 });
          }

          // If this round found nothing new, stop looping
          if (totalNew === newBeforeRound) break;
        }

        const wasCancelled = isCancelRequested(workspaceId);

        const warning =
          totalFound === 0
            ? totalQueriesFailed > 0
              ? `Google Search failed on ${totalQueriesFailed}/${totalQueriesAttempted} queries. ${allErrors[0] || ""}`.trim()
              : "Google Search returned no results. The Custom Search engine may be restricted or empty."
            : undefined;

        // Le statut final (done/cancelled) est posé avec le résultat, une fois tout enregistré
        setDiscoveryProgress(workspaceId, {
          status: "running",
          target: maxToFind,
          found: totalFound,
          newCount: totalNew,
          currentCity: "",
          round: rounds,
          startedAt: getDiscoveryProgress(workspaceId)?.startedAt || Date.now(),
          totalCities,
          completedCities: getDiscoveryProgress(workspaceId)?.completedCities || totalCities,
        });

        // Log activity
        await logActivity({
          workspaceId: workspaceId ?? undefined,
          action: wasCancelled ? "discovery_started" : "discovery_completed",
          type: wasCancelled ? "warning" : (totalNew > 0 ? "success" : "info"),
          title: wasCancelled ? "Découverte arrêtée" : "Découverte terminée",
          details: `${totalNew} nouveaux prospects trouvés sur ${totalFound} résultats (toutes les villes)`,
          importBatchId: totalNew > 0 ? batchId : undefined,
          metadata: {
            prospects_created: totalNew,
            total_found: totalFound,
            // Pour diagnostiquer une découverte vide : recherches lancées / en échec + premières erreurs
            queries_attempted: totalQueriesAttempted,
            queries_failed: totalQueriesFailed,
            queries_skipped: totalQueriesSkipped,
            errors: allErrors.slice(0, 5),
            city: "all",
            rounds,
            cancelled: wasCancelled,
            campaign_id: campaignId ?? null,
          },
        });

        // Update discovery usage counter
        if (totalNew > 0) await incrementDiscoveryUsage(totalNew);

        // Add to campaign if specified
        const { addedToCampaign, ageMatched } = await addToCampaignAfterDiscovery(totalNew);

        return {
          message: wasCancelled
            ? `Recherche arrêtée (${totalNew} nouveaux trouvés avant l'arrêt)`
            : `Discovery complete for all cities (${rounds} round${rounds > 1 ? "s" : ""})`,
          total: totalFound,
          found: totalFound,
          new: totalNew,
          target: maxToFind,
          rounds,
          cancelled: wasCancelled,
          addedToCampaign,
          ageMatched,
          batchId: totalNew > 0 ? batchId : null,
          companyAge: targeting.companyAge ?? null,
          diagnostics: {
            queriesAttempted: totalQueriesAttempted,
            queriesWithResults: totalQueriesWithResults,
            queriesFailed: totalQueriesFailed,
            queriesSkipped: totalQueriesSkipped,
            errors: allErrors,
          },
          warning: wasCancelled ? undefined : warning,
        };
      }

      updateDiscoveryProgress(workspaceId, { currentCity: city });
      const result = await discoverProspects(city, industry, maxToFind, batchId, workspaceId);

      setDiscoveryProgress(workspaceId, {
        status: "running",
        target: maxToFind,
        found: result.found,
        newCount: result.new,
        currentCity: "",
        round: 1,
        startedAt: getDiscoveryProgress(workspaceId)?.startedAt || Date.now(),
        totalCities: 1,
        completedCities: 1,
      });

      const warning =
        result.found === 0
          ? result.diagnostics.queriesFailed > 0
            ? `Google Search failed on ${result.diagnostics.queriesFailed}/${result.diagnostics.queriesAttempted} queries. ${result.diagnostics.errors[0] || ""}`.trim()
            : "Google Search returned no results. The Custom Search engine may be restricted or empty."
          : undefined;

      // Log activity
      await logActivity({
        workspaceId: workspaceId ?? undefined,
        action: "discovery_completed",
        type: result.new > 0 ? "success" : "info",
        title: "Découverte terminée",
        details: `${result.new} nouveaux prospects trouvés à ${city}`,
        importBatchId: result.new > 0 ? batchId : undefined,
        metadata: {
          prospects_created: result.new,
          total_found: result.found,
          city,
          queries_attempted: result.diagnostics.queriesAttempted,
          queries_failed: result.diagnostics.queriesFailed,
          queries_skipped: result.diagnostics.queriesSkipped ?? 0,
          errors: result.diagnostics.errors.slice(0, 5),
          industry: industry || undefined,
          campaign_id: campaignId ?? null,
        },
      });

      // Update discovery usage counter
      if (result.new > 0) await incrementDiscoveryUsage(result.new);

      // Add to campaign if specified
      const { addedToCampaign, ageMatched } = await addToCampaignAfterDiscovery(result.new);

      return {
        message: `Discovery complete for ${city}`,
        ...result,
        target: maxToFind,
        addedToCampaign,
        ageMatched,
        batchId: result.new > 0 ? batchId : null,
        companyAge: targeting.companyAge ?? null,
        warning,
      };
    } catch (error) {
      setDiscoveryProgress(workspaceId, {
        status: "error",
        target: maxToFind,
        found: getDiscoveryProgress(workspaceId)?.found || 0,
        newCount: getDiscoveryProgress(workspaceId)?.newCount || 0,
        currentCity: "",
        round: getDiscoveryProgress(workspaceId)?.round || 1,
        startedAt: getDiscoveryProgress(workspaceId)?.startedAt || Date.now(),
        totalCities: getDiscoveryProgress(workspaceId)?.totalCities || 1,
        completedCities: getDiscoveryProgress(workspaceId)?.completedCities || 0,
        error: error instanceof Error ? error.message : "Discovery failed",
      });
      await logActivity({
        workspaceId: workspaceId ?? undefined,
        action: "discovery_error",
        type: "error",
        title: "Erreur de découverte",
        details: error instanceof Error ? error.message : "Erreur inconnue",
      });
      throw error;
    }
    };

    void runJob()
      .then((result) => {
        const p = getDiscoveryProgress(workspaceId);
        if (!p) return;
        setDiscoveryProgress(workspaceId, { ...p, status: result.cancelled ? "cancelled" : "done", currentCity: "", result });
      })
      .catch((error) => {
        // Le statut « error » est déjà posé dans runJob ; on garde la trace dans les logs du serveur
        console.error("[discover] échec de la découverte en arrière-plan:", error);
      });

    return NextResponse.json({ started: true, target: maxToFind, totalCities }, { status: 202 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Discovery failed",
      },
      { status: 500 }
    );
  }
}
