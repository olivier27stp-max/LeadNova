import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { requireWorkspaceContext, handleWorkspaceError } from "@/lib/workspace";
import {
  CALL_OUTCOMES, CALL_WHO, CURRENT_TOOLS, OBJECTIONS, LOST_REASONS, CONNECTED_OUTCOMES,
} from "@/lib/call-options";
import { advanceSalesStage, isSalesStage, setSalesStage } from "@/lib/sales-pipeline";

function pick<T extends Record<string, string>>(options: T, value: unknown): keyof T | null {
  return typeof value === "string" && value in options ? (value as keyof T) : null;
}

async function ownProspect(prospectId: unknown, workspaceId: string) {
  if (typeof prospectId !== "string") return null;
  return prisma.prospect.findFirst({ where: { id: prospectId, workspaceId }, select: { id: true, companyName: true, salesStage: true } });
}

// GET /api/prospects/calls?prospectId= — historique des appels
export async function GET(request: NextRequest) {
  try {
    const ctx = await requireWorkspaceContext();
    const prospect = await ownProspect(request.nextUrl.searchParams.get("prospectId"), ctx.workspaceId);
    if (!prospect) return NextResponse.json({ error: "Prospect introuvable" }, { status: 404 });
    const calls = await prisma.callLog.findMany({
      where: { prospectId: prospect.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return NextResponse.json({ calls });
  } catch (error) {
    return handleWorkspaceError(error);
  }
}

// POST /api/prospects/calls — enregistre un appel
export async function POST(request: NextRequest) {
  try {
    const ctx = await requireWorkspaceContext();
    const body = await request.json().catch(() => ({}));
    const prospect = await ownProspect(body.prospectId, ctx.workspaceId);
    if (!prospect) return NextResponse.json({ error: "Prospect introuvable" }, { status: 404 });

    const outcome = pick(CALL_OUTCOMES, body.outcome);
    if (!outcome) return NextResponse.json({ error: "Résultat de l'appel requis" }, { status: 400 });
    const whoAnswered = pick(CALL_WHO, body.whoAnswered);
    const currentTool = pick(CURRENT_TOOLS, body.currentTool);
    const objection = pick(OBJECTIONS, body.objection);
    const employeeCount = Number.isInteger(Number(body.employeeCount)) && Number(body.employeeCount) > 0 ? Number(body.employeeCount) : null;
    const callbackAt = body.callbackAt ? new Date(body.callbackAt) : null;
    const notes = typeof body.notes === "string" ? body.notes.trim().slice(0, 2000) || null : null;

    const call = await prisma.callLog.create({
      data: {
        prospectId: prospect.id,
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        outcome,
        whoAnswered,
        currentTool,
        employeeCount,
        objection,
        callbackAt: callbackAt && !isNaN(callbackAt.getTime()) ? callbackAt : null,
        notes,
      },
    });

    const now = new Date();
    await prisma.prospect.update({
      where: { id: prospect.id },
      data: {
        lastCallAt: now,
        lastCallOutcome: outcome,
        lastCallWho: whoAnswered,
        lastObjection: objection,
        callbackAt: call.callbackAt,
        ...(currentTool ? { currentTool } : {}),
        ...(employeeCount ? { employeeCount } : {}),
        ...(CONNECTED_OUTCOMES.has(outcome) ? { lastEngagedAt: now } : {}),
        ...(outcome === "WRONG_NUMBER" ? { phone: null } : {}),
      },
    });

    // Un appel qui fixe un setting/closing call fait avancer le pipeline (jamais reculer)
    if (outcome === "SETTING_BOOKED" || outcome === "DEMO_BOOKED") {
      await advanceSalesStage({
        workspaceId: ctx.workspaceId,
        prospectId: prospect.id,
        companyName: prospect.companyName,
        from: prospect.salesStage,
        to: outcome,
        userId: ctx.userId,
      });
    }

    await logActivity({
      action: "call_logged",
      type: "info",
      title: `Appel — ${prospect.companyName} : ${CALL_OUTCOMES[outcome]}`,
      details: [whoAnswered && CALL_WHO[whoAnswered], objection && objection !== "NONE" && `Objection : ${OBJECTIONS[objection]}`, notes]
        .filter(Boolean)
        .join(" · ") || undefined,
      userId: ctx.userId,
      workspaceId: ctx.workspaceId,
      relatedEntityType: "prospect",
      relatedEntityId: prospect.id,
    });

    return NextResponse.json({ call }, { status: 201 });
  } catch (error) {
    return handleWorkspaceError(error);
  }
}

// PATCH /api/prospects/calls — étape du pipeline (aussi utilisé par le glisser-déposer de /funnel)
export async function PATCH(request: NextRequest) {
  try {
    const ctx = await requireWorkspaceContext();
    const body = await request.json().catch(() => ({}));
    const prospect = await ownProspect(body.prospectId, ctx.workspaceId);
    if (!prospect) return NextResponse.json({ error: "Prospect introuvable" }, { status: 404 });

    const salesStage = body.salesStage === "" || body.salesStage === null ? null : isSalesStage(body.salesStage) ? body.salesStage : undefined;
    if (salesStage === undefined) return NextResponse.json({ error: "Étape invalide" }, { status: 400 });
    const lostReason = salesStage === "LOST" ? pick(LOST_REASONS, body.lostReason) : null;

    const updated = await setSalesStage({
      workspaceId: ctx.workspaceId,
      prospectId: prospect.id,
      companyName: prospect.companyName,
      from: prospect.salesStage,
      to: salesStage,
      lostReason,
      lostReasonLabel: lostReason ? LOST_REASONS[lostReason] : null,
      userId: ctx.userId,
    });

    return NextResponse.json(updated);
  } catch (error) {
    return handleWorkspaceError(error);
  }
}
