import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireWorkspaceContext, handleWorkspaceError } from "@/lib/workspace";

// POST /api/calendar/dismiss-followup — dismiss a follow-up from the calendar
export async function POST(req: NextRequest) {
  try {
    const ctx = await requireWorkspaceContext();
    const workspaceId = ctx.workspaceId;
    const { eventKey } = await req.json();

    if (!eventKey) {
      return NextResponse.json({ error: "eventKey required" }, { status: 400 });
    }

    await prisma.dismissedFollowUp.upsert({
      where: { workspaceId_eventKey: { workspaceId, eventKey } },
      update: {},
      create: { workspaceId, eventKey },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleWorkspaceError(error);
  }
}

// DELETE /api/calendar/dismiss-followup — restore a dismissed follow-up
export async function DELETE(req: NextRequest) {
  try {
    const ctx = await requireWorkspaceContext();
    const workspaceId = ctx.workspaceId;
    const { eventKey } = await req.json();

    if (!eventKey) {
      return NextResponse.json({ error: "eventKey required" }, { status: 400 });
    }

    await prisma.dismissedFollowUp.deleteMany({
      where: { workspaceId, eventKey },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleWorkspaceError(error);
  }
}
