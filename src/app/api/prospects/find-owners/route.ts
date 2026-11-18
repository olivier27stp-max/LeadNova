import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { requireWorkspaceContext, handleWorkspaceError } from "@/lib/workspace";
import { analyzeOwner, saveOwnerAnalysis, type OwnerAnalysis } from "@/lib/owner-finder";

// Chaque appel traite un lot ; le frontend rappelle tant que `remaining > 0`.
export const maxDuration = 300;

const BATCH_SIZE = 18;
const CONCURRENCY = 6; // sites analysés en parallèle (aucun accès base pendant l'analyse)

function pendingWhere(workspaceId: string, ids?: string[]) {
  return {
    workspaceId,
    archivedAt: null,
    siteAnalyzedAt: null,
    ...(ids && ids.length > 0 ? { id: { in: ids } } : {}),
  };
}

// GET /api/prospects/find-owners — propriétaires trouvés / prospects restants à analyser (site + avis)
export async function GET() {
  try {
    const ctx = await requireWorkspaceContext();
    const base = { workspaceId: ctx.workspaceId, archivedAt: null };
    const found = await prisma.prospect.count({ where: { ...base, ownerName: { not: null } } });
    const checked = await prisma.prospect.count({ where: { ...base, siteAnalyzedAt: { not: null } } });
    const remaining = await prisma.prospect.count({ where: pendingWhere(ctx.workspaceId) });
    return NextResponse.json({ found, notFound: checked - found, remaining });
  } catch (error) {
    return handleWorkspaceError(error);
  }
}

// POST /api/prospects/find-owners — analyse un lot (tous les restants, ou seulement `ids`)
export async function POST(request: NextRequest) {
  try {
    const ctx = await requireWorkspaceContext();
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: "ANTHROPIC_API_KEY manquante dans les variables Railway" }, { status: 500 });
    }
    const body = await request.json().catch(() => ({}));
    const ids: string[] | undefined = Array.isArray(body?.ids) ? body.ids.filter((x: unknown) => typeof x === "string") : undefined;

    const batch = await prisma.prospect.findMany({
      where: pendingWhere(ctx.workspaceId, ids),
      select: { id: true, companyName: true, website: true, city: true },
      orderBy: { leadScore: "desc" },
      take: BATCH_SIZE,
    });

    // Analyse en parallèle (réseau + IA seulement)
    const results: Array<{ id: string; analysis: OwnerAnalysis }> = [];
    let cursor = 0;
    async function worker() {
      while (cursor < batch.length) {
        const p = batch[cursor++];
        try {
          results.push({ id: p.id, analysis: await analyzeOwner(p.companyName, p.website, p.city) });
        } catch (err) {
          console.error(`[find-owners] ${p.id} failed:`, err);
          results.push({ id: p.id, analysis: { status: "error", reason: "exception", fields: null } });
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, batch.length) }, worker));

    // Écritures en base une à la fois
    const counts = { found: 0, notFound: 0, unreachable: 0, errors: 0 };
    for (const r of results) {
      await saveOwnerAnalysis(r.id, r.analysis);
      if (r.analysis.status === "found") counts.found++;
      else if (r.analysis.status === "error") counts.errors++;
      else if (r.analysis.status === "unreachable") counts.unreachable++;
      else counts.notFound++;
    }

    const remaining = await prisma.prospect.count({ where: pendingWhere(ctx.workspaceId, ids) });

    if (batch.length > 0) {
      await logActivity({
        action: "find_owners",
        type: "success",
        title: `Analyse IA : ${counts.found} propriétaire(s) trouvé(s) sur ${batch.length} prospect(s)`,
        details: `${counts.notFound} non trouvé(s), ${counts.unreachable} site(s) inaccessible(s), ${counts.errors} erreur(s) IA`,
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
      });
    }

    // Que des erreurs IA : on arrête la boucle côté client pour ne pas tourner à vide
    const stalled = batch.length > 0 && counts.errors === batch.length;
    return NextResponse.json({ processed: batch.length, remaining, counts, stalled });
  } catch (error) {
    return handleWorkspaceError(error);
  }
}
