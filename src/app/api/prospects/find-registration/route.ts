import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { requireWorkspaceContext, handleWorkspaceError } from "@/lib/workspace";
import { analyzeRegistration, saveRegistration, type RegistrationResult } from "@/lib/registration-finder";
import { loadTargetingSettings } from "@/lib/discovery";

// Chaque appel traite un petit lot (recherche web = lent) ; le frontend rappelle tant que `remaining > 0`.
export const maxDuration = 300;

const BATCH_SIZE = 6;
const CONCURRENCY = 3;

function pendingWhere(workspaceId: string, ids?: string[], batchId?: string) {
  return {
    workspaceId,
    archivedAt: null,
    registrationCheckedAt: null,
    ...(ids && ids.length > 0 ? { id: { in: ids } } : {}),
    ...(batchId ? { importBatchId: batchId } : {}),
  };
}

/** Années d'immatriculation qui correspondent à l'âge voulu (lt3 = moins de 3 ans, gte3 = 3 ans et plus…). */
function ageYearRange(age: string, nowYear: number): { gt?: number; lte?: number } | null {
  const maxAge = ({ lt3: 3, lt5: 5 } as Record<string, number>)[age];
  const minAge = ({ gte3: 3, gte5: 5, gte10: 10 } as Record<string, number>)[age];
  if (maxAge) return { gt: nowYear - maxAge };
  if (minAge) return { lte: nowYear - minAge };
  return null;
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
    // Après une découverte : ne traiter que ce lot, puis ajouter à la campagne ceux qui ont l'âge du Ciblage
    const batchId: string | undefined = typeof body?.batchId === "string" ? body.batchId : undefined;
    const campaignId: string | undefined = typeof body?.campaignId === "string" ? body.campaignId : undefined;

    const batch = await prisma.prospect.findMany({
      where: pendingWhere(ctx.workspaceId, ids, batchId),
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

    const remaining = await prisma.prospect.count({ where: pendingWhere(ctx.workspaceId, ids, batchId) });

    // Lot de découverte terminé : ajoute à la campagne les prospects qui ont l'âge voulu (sources sûres seulement)
    let addedToCampaign: number | null = null;
    let matched: number | null = null;
    if (remaining === 0 && batchId && campaignId) {
      const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, workspaceId: ctx.workspaceId }, select: { id: true } });
      const targeting = await loadTargetingSettings(ctx.workspaceId);
      const range = targeting.companyAge ? ageYearRange(targeting.companyAge, new Date().getFullYear()) : null;
      if (campaign) {
        const keep = await prisma.prospect.findMany({
          where: {
            workspaceId: ctx.workspaceId,
            archivedAt: null,
            importBatchId: batchId,
            ...(range ? { registrationYear: range, registrationSource: { not: "domaine" } } : {}),
          },
          select: { id: true },
        });
        matched = keep.length;
        addedToCampaign = 0;
        for (const p of keep) {
          try {
            await prisma.campaignContact.create({ data: { campaignId: campaign.id, prospectId: p.id } });
            addedToCampaign++;
          } catch { /* déjà dans la campagne */ }
        }
        await logActivity({
          action: "find_registration",
          type: "success",
          title: `Ciblage par âge : ${addedToCampaign} prospect(s) ajouté(s) à la campagne`,
          details: `${matched} prospect(s) de la découverte ont l'âge voulu (${targeting.companyAge ?? "tous"}, sources sûres)`,
          workspaceId: ctx.workspaceId,
          userId: ctx.userId,
        });
      }
    }
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
    return NextResponse.json({ processed: batch.length, remaining, counts, stalled, matched, addedToCampaign });
  } catch (error) {
    return handleWorkspaceError(error);
  }
}
