import { NextRequest, NextResponse } from "next/server";
import { enrichProspect, enrichBatch, enrichByIds } from "@/lib/enrichment";
import { getEnrichProgress, requestCancelEnrich, isEnrichRunning, setEnrichProgress, updateEnrichProgress } from "@/lib/enrich-progress";

export async function GET() {
  const progress = getEnrichProgress();
  return NextResponse.json(progress || { status: "idle" });
}

export async function DELETE() {
  requestCancelEnrich();
  return NextResponse.json({ cancelled: true });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { prospectId, prospectIds, batch, limit } = body;

  try {
    // Bulk enrich: fire-and-forget on the server (survives page navigation)
    if (prospectIds && Array.isArray(prospectIds) && prospectIds.length > 0) {
      if (isEnrichRunning()) {
        return NextResponse.json(
          { error: "Un enrichissement est déjà en cours" },
          { status: 409 }
        );
      }

      // Start enrichment in background — don't await
      enrichByIds(prospectIds).catch((err) => {
        console.error("[enrichByIds] Background error:", err);
      });

      return NextResponse.json({
        message: "Enrichissement démarré",
        total: prospectIds.length,
        status: "started",
      });
    }

    if (batch) {
      if (isEnrichRunning()) {
        return NextResponse.json(
          { error: "Un enrichissement est déjà en cours" },
          { status: 409 }
        );
      }

      enrichBatch(limit || 10).catch((err) => {
        console.error("[enrichBatch] Background error:", err);
      });

      return NextResponse.json({
        message: "Enrichissement démarré",
        status: "started",
      });
    }

    if (!prospectId) {
      return NextResponse.json(
        { error: "prospectId is required" },
        { status: 400 }
      );
    }

    if (isEnrichRunning()) {
      return NextResponse.json(
        { error: "Un enrichissement est déjà en cours" },
        { status: 409 }
      );
    }

    // Fire-and-forget single prospect enrichment (non-blocking)
    setEnrichProgress({
      status: "running",
      target: 1,
      enriched: 0,
      failed: 0,
      noData: 0,
      currentProspect: "...",
      startedAt: Date.now(),
    });

    enrichProspect(prospectId)
      .then((result) => {
        const foundSomething = !!(result.email || result.phone || result.city || result.linkedinUrl || result.contactPageUrl);
        updateEnrichProgress({
          status: "done",
          enriched: foundSomething ? 1 : 0,
          noData: result.noData ? 1 : 0,
          failed: (!foundSomething && !result.noData) ? 1 : 0,
          currentProspect: "",
        });
      })
      .catch((err) => {
        console.error("[enrichProspect] Background error:", err);
        updateEnrichProgress({
          status: "error",
          failed: 1,
          currentProspect: "",
        });
      });

    return NextResponse.json({
      message: "Enrichissement démarré",
      status: "started",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Enrichment failed",
      },
      { status: 500 }
    );
  }
}
