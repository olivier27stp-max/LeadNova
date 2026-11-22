import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireWorkspaceContext, handleWorkspaceError } from "@/lib/workspace";
import { conversionChance } from "@/lib/conversion-score";
import { engagementScore } from "@/lib/engagement-score";
import {
  CALL_OUTCOMES, CURRENT_TOOLS, OBJECTIONS, LOST_REASONS, CONNECTED_OUTCOMES,
} from "@/lib/call-options";
import { stageRank } from "@/lib/sales-stages";


const PROSPECT_SELECT = {
  id: true, companyName: true, city: true, phone: true, industry: true, reviewCount: true,
  contactFormStatus: true, competitorCrm: true, email: true, emailGuessed: true, ownerName: true, status: true,
  hiring: true, complaintCount: true, ownerRepliesReviews: true, reviewsLast6m: true, onlineBooking: true,
  onlinePayment: true, teamsCount: true, serviceSegment: true, lastCallWho: true, currentTool: true,
  employeeCount: true, lastObjection: true, lastReplySentiment: true, salesStage: true, lostReason: true,
  emailOpenCount: true, emailClickCount: true, siteVisitCount: true, lastCallOutcome: true, lastEngagedAt: true,
  callbackAt: true, lastCallAt: true,
} as const;

function countBy<T extends string>(labels: Record<T, string>, values: Array<string | null>) {
  const counts = new Map<string, number>();
  for (const v of values) if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  return (Object.keys(labels) as T[])
    .map((key) => ({ key, label: labels[key], count: counts.get(key) ?? 0 }))
    .filter((x) => x.count > 0)
    .sort((a, b) => b.count - a.count);
}

// GET /api/kpis/calls?period=7|30|all — tableau de bord des appels
export async function GET(request: NextRequest) {
  try {
    const { workspaceId } = await requireWorkspaceContext();
    const period = request.nextUrl.searchParams.get("period") || "30";
    const since = period === "all" ? null : new Date(Date.now() - Number(period === "7" ? 7 : 30) * 86_400_000);

    const calls = await prisma.callLog.findMany({
      where: { workspaceId, ...(since ? { createdAt: { gte: since } } : {}) },
      select: { prospectId: true, outcome: true, whoAnswered: true, objection: true },
    });

    const prospectIds = [...new Set(calls.map((c) => c.prospectId))];
    const prospects = prospectIds.length
      ? await prisma.prospect.findMany({ where: { id: { in: prospectIds }, workspaceId }, select: PROSPECT_SELECT })
      : [];

    // ── KPIs (par appel) ──
    const connectedCalls = calls.filter((c) => CONNECTED_OUTCOMES.has(c.outcome));
    const ownerCalls = calls.filter((c) => c.whoAnswered === "OWNER");

    // ── Entonnoir (par prospect) ──
    const connectedIds = new Set(connectedCalls.map((c) => c.prospectId));
    const settingCallIds = new Set(calls.filter((c) => c.outcome === "SETTING_BOOKED").map((c) => c.prospectId));
    const demoCallIds = new Set(calls.filter((c) => c.outcome === "DEMO_BOOKED").map((c) => c.prospectId));
    // Rang du pipeline (sales-stages) : 2 = setting call prévu, 4 = closing call prévu, 6 = inscrit, 7 = payant
    const rank = (p: (typeof prospects)[number]) =>
      Math.max(stageRank(p.salesStage), demoCallIds.has(p.id) ? 4 : settingCallIds.has(p.id) ? 2 : 0);
    const funnel = [
      { key: "called", label: "Appelés", count: prospectIds.length },
      { key: "connected", label: "Joints", count: connectedIds.size },
      { key: "setting", label: "Setting call", count: prospects.filter((p) => rank(p) >= 2).length },
      { key: "demo_booked", label: "Closing call prévu", count: prospects.filter((p) => rank(p) >= 4).length },
      { key: "demo_done", label: "Closing call fait", count: prospects.filter((p) => rank(p) >= 5).length },
      { key: "trial", label: "Inscrit", count: prospects.filter((p) => rank(p) >= 6).length },
      { key: "won", label: "Payant", count: prospects.filter((p) => rank(p) >= 7).length },
    ];
    const won = funnel[6].count;
    const demos = funnel[3].count;

    // ── Calibrage : la Chance (sans tenir compte de l'étape de vente) prédit-elle les ventes ? ──
    const buckets = [
      { key: "0-3", label: "0 à 3", min: 0, max: 3 },
      { key: "4-5", label: "4 à 5", min: 4, max: 5 },
      { key: "6-7", label: "6 à 7", min: 6, max: 7 },
      { key: "8-10", label: "8 à 10", min: 8, max: 10 },
    ].map((b) => ({ ...b, called: 0, connected: 0, demos: 0, won: 0 }));
    for (const p of prospects) {
      const { score } = conversionChance({
        ...p,
        salesStage: null,
        lostReason: null,
        status: p.status === "QUALIFIED" || p.status === "NOT_INTERESTED" ? "CONTACTED" : p.status,
      });
      const b = buckets.find((x) => score >= x.min && score <= x.max);
      if (!b) continue;
      b.called++;
      if (connectedIds.has(p.id)) b.connected++;
      if (rank(p) >= 4) b.demos++;
      if (rank(p) >= 7) b.won++;
    }

    // ── Listes d'action (indépendantes de la période) ──
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);
    const callbacksRaw = await prisma.prospect.findMany({
      where: { workspaceId, archivedAt: null, callbackAt: { lte: endOfToday } },
      select: PROSPECT_SELECT,
      orderBy: { callbackAt: "asc" },
      take: 30,
    });
    const recentRaw = await prisma.prospect.findMany({
      where: { workspaceId, archivedAt: null, lastEngagedAt: { gte: new Date(Date.now() - 2 * 86_400_000) } },
      select: PROSPECT_SELECT,
      orderBy: { lastEngagedAt: "desc" },
      take: 200,
    });
    const toRow = (p: (typeof callbacksRaw)[number]) => ({
      id: p.id,
      companyName: p.companyName,
      city: p.city,
      phone: p.phone,
      ownerName: p.ownerName,
      callbackAt: p.callbackAt,
      lastCallOutcome: p.lastCallOutcome,
      conversion: conversionChance(p).score,
      engagement: engagementScore(p),
    });
    const hot = recentRaw
      .map(toRow)
      .filter((r) => r.engagement.hot && r.phone)
      .sort((a, b) => b.engagement.score - a.engagement.score || b.conversion - a.conversion)
      .slice(0, 30);

    return NextResponse.json({
      period,
      kpis: {
        calls: calls.length,
        prospectsCalled: prospectIds.length,
        connectRate: calls.length ? connectedCalls.length / calls.length : null,
        ownerRate: connectedCalls.length ? ownerCalls.length / connectedCalls.length : null,
        demos,
        won,
        closeRate: connectedIds.size ? won / connectedIds.size : null,
        demoToWin: demos ? won / demos : null,
      },
      funnel,
      breakdowns: {
        outcomes: countBy(CALL_OUTCOMES, calls.map((c) => c.outcome)),
        objections: countBy(OBJECTIONS, calls.map((c) => c.objection)),
        tools: countBy(CURRENT_TOOLS, prospects.map((p) => p.currentTool)),
        lostReasons: countBy(LOST_REASONS, prospects.filter((p) => p.salesStage === "LOST").map((p) => p.lostReason)),
      },
      calibration: buckets.map(({ min: _min, max: _max, ...b }) => b),
      callbacks: callbacksRaw.map(toRow),
      hot,
    });
  } catch (error) {
    return handleWorkspaceError(error);
  }
}
