import { NextRequest, NextResponse } from "next/server";
import { enrichProspect, enrichBatch, enrichByIds } from "@/lib/enrichment";
import { getEnrichProgress, requestCancelEnrich, isEnrichRunning, setEnrichProgress, updateEnrichProgress } from "@/lib/enrich-progress";
import { getWorkspaceContext } from "@/lib/workspace";
import { prisma } from "@/lib/db";

async function getWsId(): Promise<string | null> {
  const ctx = await getWorkspaceContext();
  return ctx?.workspaceId ?? null;
}

const unauthorized = () => NextResponse.json({ error: "Non autorisé" }, { status: 401 });

/** Avertissement si les recherches externes sont désactivées (seul le site web sera analysé). */
function missingKeysWarning(): string | undefined {
  const missing: string[] = [];
  if (!process.env.SERPER_API_KEY) missing.push("SERPER_API_KEY (recherche web)");
  if (!process.env.OUTSCRAPER_API_KEY && !process.env.GOOGLE_PLACES_API_KEY) {
    missing.push("OUTSCRAPER_API_KEY ou GOOGLE_PLACES_API_KEY (Google Maps)");
  }
  if (missing.length === 0) return undefined;
  return `Clés API manquantes : ${missing.join(", ")}. L'enrichissement se limitera au site web des prospects ; ceux sans site ne pourront pas être complétés.`;
}

export async function GET() {
  const wsId = await getWsId();
  if (!wsId) return unauthorized();
  const progress = getEnrichProgress(wsId);
  return NextResponse.json(progress || { status: "idle" });
}

export async function DELETE() {
  const wsId = await getWsId();
  if (!wsId) return unauthorized();
  requestCancelEnrich(wsId);
  return NextResponse.json({ cancelled: true });
}

export async function POST(request: NextRequest) {
  const wsId = await getWsId();
  if (!wsId) return unauthorized();
  const warning = missingKeysWarning();
  const body = await request.json();
  const { prospectId, prospectIds, batch, limit } = body;

  try {
    // Bulk enrich: fire-and-forget on the server (survives page navigation)
    if (prospectIds && Array.isArray(prospectIds) && prospectIds.length > 0) {
      if (isEnrichRunning(wsId)) {
        return NextResponse.json(
          { error: "Un enrichissement est déjà en cours" },
          { status: 409 }
        );
      }

      // Start enrichment in background — don't await
      enrichByIds(prospectIds, wsId).catch((err) => {
        console.error("[enrichByIds] Background error:", err);
      });

      return NextResponse.json({
        message: "Enrichissement démarré",
        total: prospectIds.length,
        status: "started",
        ...(warning ? { warning } : {}),
      });
    }

    if (batch) {
      if (isEnrichRunning(wsId)) {
        return NextResponse.json(
          { error: "Un enrichissement est déjà en cours" },
          { status: 409 }
        );
      }

      enrichBatch(limit || 10, wsId).catch((err) => {
        console.error("[enrichBatch] Background error:", err);
      });

      return NextResponse.json({
        message: "Enrichissement démarré",
        status: "started",
        ...(warning ? { warning } : {}),
      });
    }

    if (!prospectId) {
      return NextResponse.json(
        { error: "prospectId requis" },
        { status: 400 }
      );
    }

    if (isEnrichRunning(wsId)) {
      return NextResponse.json(
        { error: "Un enrichissement est déjà en cours" },
        { status: 409 }
      );
    }

    const owned = await prisma.prospect.findFirst({
      where: { id: prospectId, workspaceId: wsId },
      select: { id: true },
    });
    if (!owned) {
      return NextResponse.json({ error: "Prospect introuvable" }, { status: 404 });
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
    }, wsId);

    enrichProspect(prospectId)
      .then((result) => {
        const foundSomething = !result.noData && !!(result.email || result.phone || result.city || result.linkedinUrl || result.contactPageUrl);
        updateEnrichProgress({
          status: "done",
          enriched: foundSomething ? 1 : 0,
          noData: result.noData ? 1 : 0,
          failed: (!foundSomething && !result.noData) ? 1 : 0,
          currentProspect: "",
        }, wsId);
      })
      .catch((err) => {
        console.error("[enrichProspect] Background error:", err);
        updateEnrichProgress({
          status: "error",
          failed: 1,
          currentProspect: "",
        }, wsId);
      });

    return NextResponse.json({
      message: "Enrichissement démarré",
      status: "started",
      ...(warning ? { warning } : {}),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Échec de l'enrichissement",
      },
      { status: 500 }
    );
  }
}
