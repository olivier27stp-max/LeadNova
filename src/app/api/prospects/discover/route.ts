import { NextResponse, NextRequest } from "next/server";
import { discoverProspects, discoverAllCities, loadTargetingSettings } from "@/lib/discovery";
import { getDiscoveryProgress, setDiscoveryProgress, updateDiscoveryProgress, requestCancelDiscovery, isCancelRequested } from "@/lib/discovery-progress";
import { logActivity, generateBatchId } from "@/lib/activity";
import { getWorkspaceContext } from "@/lib/workspace";
import { prisma } from "@/lib/db";

export async function GET() {
  // Progression de l'espace de travail actif seulement
  const ctx = await getWorkspaceContext();
  const progress = getDiscoveryProgress(ctx?.workspaceId ?? null);
  return NextResponse.json(progress || { status: "idle" });
}

export async function DELETE() {
  const ctx = await getWorkspaceContext();
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
      try {
        const prospects = await prisma.prospect.findMany({
          where: { importBatchId: batchId, workspaceId: workspaceId ?? null, archivedAt: null },
          select: { id: true },
        });
        if (prospects.length === 0) return 0;
        let added = 0;
        for (const p of prospects) {
          try {
            await prisma.campaignContact.create({
              data: { campaignId, prospectId: p.id },
            });
            added++;
          } catch {
            // Duplicate — already in campaign, skip
          }
        }
        return added;
      } catch { return 0; }
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

    try {
      if (city === "all") {
        // Loop through cities multiple rounds until target is reached
        let totalFound = 0;
        let totalNew = 0;
        let totalQueriesAttempted = 0;
        let totalQueriesWithResults = 0;
        let totalQueriesFailed = 0;
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

        setDiscoveryProgress(workspaceId, {
          status: wasCancelled ? "cancelled" : "done",
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
            errors: allErrors.slice(0, 5),
            city: "all",
            rounds,
            cancelled: wasCancelled,
          },
        });

        // Update discovery usage counter
        if (totalNew > 0) await incrementDiscoveryUsage(totalNew);

        // Add to campaign if specified
        let addedToCampaign = 0;
        if (campaignId && totalNew > 0 && !targeting.companyAge) {
          addedToCampaign = await addProspectsToCampaign(batchId, campaignId);
        }

        return NextResponse.json({
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
          batchId: totalNew > 0 ? batchId : null,
          companyAge: targeting.companyAge ?? null,
          diagnostics: {
            queriesAttempted: totalQueriesAttempted,
            queriesWithResults: totalQueriesWithResults,
            queriesFailed: totalQueriesFailed,
            errors: allErrors,
          },
          warning: wasCancelled ? undefined : warning,
        });
      }

      if (!city) {
        setDiscoveryProgress(workspaceId, null);
        return NextResponse.json(
          { error: "City is required" },
          { status: 400 }
        );
      }

      updateDiscoveryProgress(workspaceId, { currentCity: city });
      const result = await discoverProspects(city, industry, maxToFind, batchId, workspaceId);

      setDiscoveryProgress(workspaceId, {
        status: "done",
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
          errors: result.diagnostics.errors.slice(0, 5),
          industry: industry || undefined,
        },
      });

      // Update discovery usage counter
      if (result.new > 0) await incrementDiscoveryUsage(result.new);

      // Add to campaign if specified
      let addedToCampaign = 0;
      if (campaignId && result.new > 0 && !targeting.companyAge) {
        addedToCampaign = await addProspectsToCampaign(batchId, campaignId);
      }

      return NextResponse.json({
        message: `Discovery complete for ${city}`,
        ...result,
        target: maxToFind,
        addedToCampaign,
        batchId: result.new > 0 ? batchId : null,
        companyAge: targeting.companyAge ?? null,
        warning,
      });
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
