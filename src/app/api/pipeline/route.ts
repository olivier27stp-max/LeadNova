import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireWorkspaceContext, handleWorkspaceError } from "@/lib/workspace";
import { engagementScore } from "@/lib/engagement-score";
import { conversionChance } from "@/lib/conversion-score";
import { PIPELINE_STAGES, SALES_STAGES, stageRank, setSalesStage, isSalesStage } from "@/lib/sales-pipeline";

const CARD_SELECT = {
  id: true, companyName: true, ownerName: true, city: true, phone: true, email: true, emailGuessed: true,
  industry: true, reviewCount: true, contactFormStatus: true, competitorCrm: true, status: true,
  hiring: true, complaintCount: true, ownerRepliesReviews: true, reviewsLast6m: true, onlineBooking: true,
  onlinePayment: true, teamsCount: true, serviceSegment: true, lastCallWho: true, currentTool: true,
  employeeCount: true, lastObjection: true, lastReplySentiment: true, salesStage: true, lostReason: true,
  emailOpenCount: true, emailClickCount: true, siteVisitCount: true, lastCallOutcome: true, lastEngagedAt: true,
  callbackAt: true, lastCallAt: true, updatedAt: true,
} as const;

// Anciennes étiquettes (avant metadata { to }) → clé d'étape
const LEGACY_LABELS: Record<string, string> = {
  "Démo prise": "DEMO_BOOKED", "Démo faite": "DEMO_DONE", "Essai gratuit": "TRIAL", "Vendu": "WON", "Perdu": "LOST",
  ...Object.fromEntries(Object.entries(SALES_STAGES).map(([k, v]) => [v, k])),
};

function eventStage(log: { metadata: unknown; title: string }): string | null {
  const meta = log.metadata as { to?: unknown } | null;
  if (meta && typeof meta.to === "string") return meta.to || null;
  const label = log.title.slice(log.title.lastIndexOf(" : ") + 3);
  return LEGACY_LABELS[label] ?? null;
}

// Ancien funnel à colonnes libres (funnel_stages) → étape du pipeline, une seule fois par prospect
const OLD_FUNNEL_MAP: Record<string, string> = {
  interested: "POSITIVE_REPLY", "hot-follow-up-1": "POSITIVE_REPLY", "hot-follow-up-2": "POSITIVE_REPLY",
  closed: "WON", lost: "LOST", "not-interested": "LOST",
};

async function importOldFunnel(workspaceId: string, userId: string) {
  const rows = await prisma.funnelProspect.findMany({
    where: { stage: { workspaceId, slug: { in: Object.keys(OLD_FUNNEL_MAP) } }, prospect: { salesStage: null, archivedAt: null } },
    select: { id: true, stage: { select: { slug: true } }, prospect: { select: { id: true, companyName: true } } },
  });
  for (const r of rows) {
    const to = OLD_FUNNEL_MAP[r.stage.slug];
    if (!isSalesStage(to)) continue;
    await setSalesStage({ workspaceId, prospectId: r.prospect.id, companyName: r.prospect.companyName, from: null, to, userId });
    await prisma.funnelProspect.delete({ where: { id: r.id } });
  }
}

/** Prospects distincts (dans l'espace) ayant une activité courriel qui répond au filtre */
async function distinctProspects(workspaceId: string, where: Record<string, unknown>) {
  const rows = await prisma.emailActivity.findMany({
    where: { ...where, prospect: { workspaceId } },
    select: { prospectId: true },
    distinct: ["prospectId"],
  });
  return new Set(rows.map((r) => r.prospectId));
}

// GET /api/pipeline?period=7|30|90|all — colonnes du pipeline + funnel de conversion de la période
export async function GET(request: NextRequest) {
  try {
    const { workspaceId, userId } = await requireWorkspaceContext();
    const period = request.nextUrl.searchParams.get("period") || "30";
    const days = { "7": 7, "30": 30, "90": 90 }[period] ?? null;
    const since = days ? new Date(Date.now() - days * 86_400_000) : null;
    const inPeriod = since ? { gte: since } : undefined;

    await importOldFunnel(workspaceId, userId);

    // ── Colonnes ──
    const active = await prisma.prospect.findMany({
      where: { workspaceId, archivedAt: null, salesStage: { in: PIPELINE_STAGES.map((s) => s.key) } },
      select: CARD_SELECT,
    });
    const lost = await prisma.prospect.findMany({
      where: { workspaceId, archivedAt: null, salesStage: "LOST" },
      select: CARD_SELECT,
      orderBy: { updatedAt: "desc" },
      take: 100,
    });
    const cards = [...active, ...lost];

    // Date d'entrée dans l'étape actuelle (dernier changement d'étape)
    const lastMoves = cards.length
      ? await prisma.activityLog.findMany({
          where: { workspaceId, action: "sales_stage", relatedEntityId: { in: cards.map((c) => c.id) } },
          select: { relatedEntityId: true, createdAt: true },
          orderBy: { createdAt: "desc" },
        })
      : [];
    const since_ = new Map<string, Date>();
    for (const m of lastMoves) if (m.relatedEntityId && !since_.has(m.relatedEntityId)) since_.set(m.relatedEntityId, m.createdAt);

    const toCard = (p: (typeof cards)[number]) => ({
      id: p.id,
      companyName: p.companyName,
      ownerName: p.ownerName,
      city: p.city,
      phone: p.phone,
      email: p.emailGuessed ? null : p.email,
      salesStage: p.salesStage,
      lostReason: p.lostReason,
      callbackAt: p.callbackAt,
      lastCallAt: p.lastCallAt,
      daysInStage: Math.max(0, Math.floor((Date.now() - +(since_.get(p.id) ?? p.updatedAt)) / 86_400_000)),
      callbackDue: !!p.callbackAt && +p.callbackAt < Date.now() + 86_400_000,
      engagement: engagementScore(p),
      conversion: conversionChance(p).score,
    });
    const columns = [...PIPELINE_STAGES.map((s) => s.key), "LOST" as const].map((key) => ({
      key,
      label: SALES_STAGES[key],
      cards: cards
        .filter((c) => c.salesStage === key)
        .map(toCard)
        .sort((a, b) => a.daysInStage - b.daysInStage),
    }));

    // ── Funnel de la période ──
    // Haut : courriels (par prospect). Bas : plus haute étape atteinte dans la période (historique daté).
    const emailed = await distinctProspects(workspaceId, { sentAt: inPeriod });
    const replied = await distinctProspects(workspaceId, { replyReceived: true, ...(since ? { OR: [{ repliedAt: inPeriod }, { repliedAt: null, sentAt: inPeriod }] } : {}) });
    const positive = await distinctProspects(workspaceId, { replySentiment: "positive", ...(since ? { OR: [{ repliedAt: inPeriod }, { repliedAt: null, sentAt: inPeriod }] } : {}) });

    const events = await prisma.activityLog.findMany({
      where: { workspaceId, action: "sales_stage", createdAt: inPeriod },
      select: { relatedEntityId: true, metadata: true, title: true },
    });
    const reached = new Map<string, number>();
    const bump = (id: string, r: number) => { if (r > (reached.get(id) ?? 0)) reached.set(id, r); };
    for (const e of events) if (e.relatedEntityId) bump(e.relatedEntityId, stageRank(eventStage(e)));
    for (const id of positive) bump(id, 1);
    if (!since) for (const p of active) bump(p.id, stageRank(p.salesStage)); // étapes posées avant l'historique
    const lostIds = new Set(events.filter((e) => eventStage(e) === "LOST").map((e) => e.relatedEntityId));

    const atLeast = (r: number) => [...reached.values()].filter((v) => v >= r).length;
    const steps = [
      { key: "emailed", label: "Courriels envoyés", count: emailed.size },
      { key: "replied", label: "Réponses", count: Math.max(replied.size, atLeast(1)) },
      ...PIPELINE_STAGES.map((s, i) => ({ key: s.key, label: s.label, count: atLeast(i + 1) })),
    ];
    const funnel = steps.map((s, i) => ({
      ...s,
      rate: i === 0 || !steps[i - 1].count ? null : s.count / steps[i - 1].count,
    }));

    return NextResponse.json({ period, columns, funnel, lostInPeriod: lostIds.size });
  } catch (error) {
    return handleWorkspaceError(error);
  }
}
