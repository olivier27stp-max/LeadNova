import { NextResponse, NextRequest } from "next/server";
import { discoverProspects, discoverAllCities } from "@/lib/discovery";
import { TARGET_CITIES } from "@/lib/config";
import { getDiscoveryProgress, setDiscoveryProgress, updateDiscoveryProgress, requestCancelDiscovery, isCancelRequested } from "@/lib/discovery-progress";
import { logActivity, generateBatchId } from "@/lib/activity";
import { getWorkspaceContext } from "@/lib/workspace";

export async function GET() {
  const progress = getDiscoveryProgress();
  return NextResponse.json(progress || { status: "idle" });
}

export async function DELETE() {
  requestCancelDiscovery();
  return NextResponse.json({ cancelled: true });
}

export async function POST(request: NextRequest) {
  const ctx = await getWorkspaceContext();
  const workspaceId = ctx?.workspaceId ?? null;

  const body = await request.json();
  const { city, industry, targetCount } = body;
  const target = Math.max(1, targetCount || 10);

  try {
    const maxToFind = target;

    // Initialize progress tracking
    const totalCities = city === "all" ? TARGET_CITIES.length : 1;
    setDiscoveryProgress({
      status: "running",
      target: maxToFind,
      found: 0,
      newCount: 0,
      currentCity: city === "all" ? TARGET_CITIES[0] || "" : city,
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
        const maxRounds = 5;

        while (totalNew < maxToFind && rounds < maxRounds) {
          if (isCancelRequested()) break;
          rounds++;
          const newBeforeRound = totalNew;
          updateDiscoveryProgress({ round: rounds });

          for (const targetCity of TARGET_CITIES) {
            if (totalNew >= maxToFind || isCancelRequested()) break;

            updateDiscoveryProgress({ currentCity: targetCity });

            const batchMax = maxToFind - totalNew;
            const result = await discoverProspects(targetCity, undefined, batchMax, batchId, workspaceId);

            totalFound += result.found;
            totalNew += result.new;
            totalQueriesAttempted += result.diagnostics.queriesAttempted;
            totalQueriesWithResults += result.diagnostics.queriesWithResults;
            totalQueriesFailed += result.diagnostics.queriesFailed;
            allErrors.push(...result.diagnostics.errors);

            updateDiscoveryProgress({ found: totalFound, newCount: totalNew, completedCities: (getDiscoveryProgress()?.completedCities || 0) + 1 });
          }

          // If this round found nothing new, stop looping
          if (totalNew === newBeforeRound) break;
        }

        const wasCancelled = isCancelRequested();

        const warning =
          totalFound === 0
            ? totalQueriesFailed > 0
              ? `Google Search failed on ${totalQueriesFailed}/${totalQueriesAttempted} queries. ${allErrors[0] || ""}`.trim()
              : "Google Search returned no results. The Custom Search engine may be restricted or empty."
            : undefined;

        setDiscoveryProgress({
          status: wasCancelled ? "cancelled" : "done",
          target: maxToFind,
          found: totalFound,
          newCount: totalNew,
          currentCity: "",
          round: rounds,
          startedAt: getDiscoveryProgress()?.startedAt || Date.now(),
          totalCities,
          completedCities: getDiscoveryProgress()?.completedCities || totalCities,
        });

        // Log activity
        await logActivity({
          action: wasCancelled ? "discovery_started" : "discovery_completed",
          type: wasCancelled ? "warning" : (totalNew > 0 ? "success" : "info"),
          title: wasCancelled ? "Découverte arrêtée" : "Découverte terminée",
          details: `${totalNew} nouveaux prospects trouvés sur ${totalFound} résultats (toutes les villes)`,
          importBatchId: totalNew > 0 ? batchId : undefined,
          metadata: {
            prospects_created: totalNew,
            total_found: totalFound,
            city: "all",
            rounds,
            cancelled: wasCancelled,
          },
        });

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
        setDiscoveryProgress(null);
        return NextResponse.json(
          { error: "City is required" },
          { status: 400 }
        );
      }

      updateDiscoveryProgress({ currentCity: city });
      const result = await discoverProspects(city, industry, maxToFind, batchId, workspaceId);

      setDiscoveryProgress({
        status: "done",
        target: maxToFind,
        found: result.found,
        newCount: result.new,
        currentCity: "",
        round: 1,
        startedAt: getDiscoveryProgress()?.startedAt || Date.now(),
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
        action: "discovery_completed",
        type: result.new > 0 ? "success" : "info",
        title: "Découverte terminée",
        details: `${result.new} nouveaux prospects trouvés à ${city}`,
        importBatchId: result.new > 0 ? batchId : undefined,
        metadata: {
          prospects_created: result.new,
          total_found: result.found,
          city,
          industry: industry || undefined,
        },
      });

      return NextResponse.json({
        message: `Discovery complete for ${city}`,
        ...result,
        target: maxToFind,
        warning,
      });
    } catch (error) {
      setDiscoveryProgress({
        status: "error",
        target: maxToFind,
        found: getDiscoveryProgress()?.found || 0,
        newCount: getDiscoveryProgress()?.newCount || 0,
        currentCity: "",
        round: getDiscoveryProgress()?.round || 1,
        startedAt: getDiscoveryProgress()?.startedAt || Date.now(),
        totalCities: getDiscoveryProgress()?.totalCities || 1,
        completedCities: getDiscoveryProgress()?.completedCities || 0,
        error: error instanceof Error ? error.message : "Discovery failed",
      });
      await logActivity({
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
