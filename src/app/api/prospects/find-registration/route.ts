import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { requireWorkspaceContext, handleWorkspaceError } from "@/lib/workspace";
import { analyzeRegistration, saveRegistration, type RegistrationResult } from "@/lib/registration-finder";

// Chaque appel traite un petit lot (recherche web = lent) ; le frontend rappelle tant que `remaining > 0`.
export const maxDuration = 300;

const BATCH_SIZE = 6;
const CONCURRENCY = 3;

function pendingWhere(workspaceId: string, ids?: string[]) {
  return {
    workspaceId,
    archivedAt: null,
    registrationCheckedAt: null,
    ...(ids && ids.length > 0 ? { id: { in: ids } } : {}),
  };
}

// GET /api/prospects/find-registration — combien ont une année, combien restent à chercher
export async function GET() {
  try {
    const ctx = await requireWorkspaceContext();
    const base = { workspaceId: ctx.workspaceId, archivedAt: null };
    const cutoff = new Date().getFullYear() - 3;
    const found = await prisma.prospect.count({ where: { ...base, registrationYear: { not: null } } });
    const recent = await prisma.prospect.count({ where: { ...base, registrationYear: { gt: cutoff } } });
    const checked = await prisma.prospect.count({ where: { ...base, registrationCheckedAt: { not: null } } });
    const remaining = await prisma.prospect.count({ where: pendingWhere(ctx.workspaceId) });
    return NextResponse.json({ found, recent, older: found - recent, unknown: checked - found, remaining });
  } catch (error) {
    return handleWorkspaceError(error);
  }
}

// POST /api/prospects/find-registration — cherche l'année d'un lot (tous les restants, ou seulement `ids`)
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
      select: { id: true, companyName: true, city: true, phone: true, website: true },
      orderBy: { leadScore: "desc" },
      take: BATCH_SIZE,
    });

    const results: Array<{ id: string; r: RegistrationResult }> = [];
    let cursor = 0;
    async function worker() {
      while (cursor < batch.length) {
        const p = batch[cursor++];
        try {
          results.push({ id: p.id, r: await analyzeRegistration(p) });
        } catch (err) {
          console.error(`[find-registration] ${p.id} failed:`, err);
          results.push({ id: p.id, r: { status: "error", reason: "exception", fields: null } });
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, batch.length) }, worker));

    // Écritures une à la fois
    const counts = { found: 0, hint: 0, notFound: 0, errors: 0 };
    for (const { id, r } of results) {
      await saveRegistration(id, r);
      if (r.status === "found") counts.found++;
      else if (r.status === "hint") counts.hint++;
      else if (r.status === "error") counts.errors++;
      else counts.notFound++;
    }

    const remaining = await prisma.prospect.count({ where: pendingWhere(ctx.workspaceId, ids) });
    if (batch.length > 0) {
      await logActivity({
        action: "find_registration",
        type: "success",
        title: `Année d'immatriculation : ${counts.found} trouvée(s) sur ${batch.length} prospect(s)`,
        details: `${counts.hint} indice(s) par nom de domaine, ${counts.notFound} non trouvée(s), ${counts.errors} erreur(s) IA`,
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
      });
    }

    const stalled = batch.length > 0 && counts.errors === batch.length;
    return NextResponse.json({ processed: batch.length, remaining, counts, stalled });
  } catch (error) {
    return handleWorkspaceError(error);
  }
}
