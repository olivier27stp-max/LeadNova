import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getWorkspaceContext } from "@/lib/workspace";
import { deepEnrichByIds } from "@/lib/enrichment";
import { isEnrichRunning } from "@/lib/enrich-progress";
import { logActivity } from "@/lib/activity";

// POST /api/prospects/deep-enrich
// body: { ids: string[] }
// Increments emailEnrichmentAttempts and triggers re-enrichment in background
export async function POST(req: NextRequest) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const { ids } = await req.json() as { ids: string[] };

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: "Aucun prospect sélectionné" }, { status: 400 });
  }

  if (isEnrichRunning(ctx.workspaceId)) {
    return NextResponse.json({ error: "Un enrichissement est déjà en cours" }, { status: 409 });
  }

  // Verify these prospects belong to this workspace
  const prospects = await prisma.prospect.findMany({
    where: { id: { in: ids }, workspaceId: ctx.workspaceId },
    select: { id: true },
  });

  const validIds = prospects.map((p) => p.id);
  if (validIds.length === 0) {
    return NextResponse.json({ error: "Aucun prospect trouvé" }, { status: 404 });
  }

  // Increment enrichment attempt counter sequentially
  for (const id of validIds) {
    await prisma.prospect.update({
      where: { id },
      data: { emailEnrichmentAttempts: { increment: 1 } },
    });
  }

  // Fire-and-forget deep re-enrichment (clears old email, searches directories, more pages)
  deepEnrichByIds(validIds, ctx.workspaceId).catch((err) => {
    console.error("[deep-enrich] Background error:", err);
  });

  await logActivity({
    action: "deep_enrich_started",
    type: "info",
    title: `Approfondissement lancé pour ${validIds.length} prospect(s)`,
    details: "Recherche approfondie d'emails en cours en arrière-plan",
    workspaceId: ctx.workspaceId,
  });

  return NextResponse.json({ started: validIds.length });
}
