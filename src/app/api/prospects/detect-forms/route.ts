import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { detectProspectForms } from "@/lib/enrichment";
import { logActivity } from "@/lib/activity";
import { requireWorkspaceContext, handleWorkspaceError } from "@/lib/workspace";

// Chaque appel traite un lot ; le frontend rappelle tant que `remaining > 0`.
export const maxDuration = 300;

const BATCH_SIZE = 20;
const TIME_BUDGET_MS = 200_000; // marge sous maxDuration

function pendingWhere(workspaceId: string) {
  return { workspaceId, archivedAt: null, contactFormStatus: null };
}

// GET /api/prospects/detect-forms — répartition des segments + nombre restant à analyser
export async function GET() {
  try {
    const ctx = await requireWorkspaceContext();
    const base = { workspaceId: ctx.workspaceId, archivedAt: null };
    const hasForm = await prisma.prospect.count({ where: { ...base, contactFormStatus: "HAS_FORM" } });
    const noForm = await prisma.prospect.count({ where: { ...base, contactFormStatus: "NO_FORM" } });
    const noWebsite = await prisma.prospect.count({ where: { ...base, contactFormStatus: "NO_WEBSITE" } });
    const unreachable = await prisma.prospect.count({ where: { ...base, contactFormStatus: "UNREACHABLE" } });
    const competitorCrm = await prisma.prospect.count({ where: { ...base, competitorCrm: { not: null } } });
    const remaining = await prisma.prospect.count({ where: pendingWhere(ctx.workspaceId) });
    return NextResponse.json({ hasForm, noForm, noWebsite, unreachable, competitorCrm, remaining });
  } catch (error) {
    return handleWorkspaceError(error);
  }
}

// POST /api/prospects/detect-forms — analyse un lot de prospects jamais classés
export async function POST() {
  try {
    const ctx = await requireWorkspaceContext();
    const started = Date.now();

    const batch = await prisma.prospect.findMany({
      where: pendingWhere(ctx.workspaceId),
      select: { id: true },
      orderBy: { leadScore: "desc" },
      take: BATCH_SIZE,
    });

    const counts = { HAS_FORM: 0, NO_FORM: 0, NO_WEBSITE: 0, UNREACHABLE: 0, crm: 0 };
    let processed = 0;
    for (const p of batch) {
      if (Date.now() - started > TIME_BUDGET_MS) break;
      try {
        const r = await detectProspectForms(p.id);
        if (r.status && r.status in counts) counts[r.status as keyof typeof counts]++;
        if (r.crm) counts.crm++;
      } catch (err) {
        console.error(`[detect-forms] ${p.id} failed:`, err);
        await prisma.prospect.update({ where: { id: p.id }, data: { contactFormStatus: "UNREACHABLE" } });
        counts.UNREACHABLE++;
      }
      processed++;
    }

    const remaining = await prisma.prospect.count({ where: pendingWhere(ctx.workspaceId) });

    if (processed > 0) {
      await logActivity({
        action: "detect_forms",
        type: "success",
        title: `Formulaires analysés : ${processed} prospect(s)`,
        details: `${counts.HAS_FORM} avec formulaire · ${counts.NO_FORM} sans formulaire · ${counts.NO_WEBSITE} sans site · ${counts.UNREACHABLE} injoignables · ${counts.crm} CRM concurrent`,
        userId: ctx.userId,
        workspaceId: ctx.workspaceId,
        relatedEntityType: "prospect",
        metadata: { ...counts, processed, remaining },
      });
    }

    return NextResponse.json({ processed, remaining, counts });
  } catch (error) {
    return handleWorkspaceError(error);
  }
}
