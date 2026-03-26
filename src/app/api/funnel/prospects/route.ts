import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { getActiveWorkspaceId } from "@/lib/workspace";

async function getWorkspaceId() {
  const user = await getSessionUser();
  if (!user) return null;
  return getActiveWorkspaceId(user.id);
}

// PATCH — move prospect to a stage (or reorder within stage)
export async function PATCH(request: NextRequest) {
  try {
    const workspaceId = await getWorkspaceId();
    if (!workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { prospectId, stageId, sortOrder } = await request.json();

    if (!prospectId || !stageId) {
      return NextResponse.json({ error: "prospectId and stageId required" }, { status: 400 });
    }

    // Verify stage belongs to workspace
    const stage = await prisma.funnelStage.findFirst({
      where: { id: stageId, workspaceId },
    });
    if (!stage) return NextResponse.json({ error: "Stage not found" }, { status: 404 });

    // Upsert: if prospect already in funnel, move it; otherwise add it
    const existing = await prisma.funnelProspect.findUnique({
      where: { prospectId },
    });

    if (existing) {
      await prisma.funnelProspect.update({
        where: { id: existing.id },
        data: { stageId, sortOrder: sortOrder ?? 0 },
      });
    } else {
      await prisma.funnelProspect.create({
        data: { stageId, prospectId, sortOrder: sortOrder ?? 0 },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[funnel/prospects PATCH]", error);
    return NextResponse.json({ error: "Failed to move prospect" }, { status: 500 });
  }
}

// POST — bulk reorder prospects within a stage
export async function POST(request: NextRequest) {
  try {
    const workspaceId = await getWorkspaceId();
    if (!workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { updates } = await request.json();
    // updates: Array<{ prospectId: string, stageId: string, sortOrder: number }>

    if (!Array.isArray(updates)) {
      return NextResponse.json({ error: "updates array required" }, { status: 400 });
    }

    for (const update of updates) {
      const existing = await prisma.funnelProspect.findUnique({
        where: { prospectId: update.prospectId },
      });

      if (existing) {
        await prisma.funnelProspect.update({
          where: { id: existing.id },
          data: { stageId: update.stageId, sortOrder: update.sortOrder },
        });
      } else {
        await prisma.funnelProspect.create({
          data: {
            stageId: update.stageId,
            prospectId: update.prospectId,
            sortOrder: update.sortOrder,
          },
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[funnel/prospects POST]", error);
    return NextResponse.json({ error: "Failed to reorder prospects" }, { status: 500 });
  }
}

// DELETE — remove prospect from funnel
export async function DELETE(request: NextRequest) {
  try {
    const workspaceId = await getWorkspaceId();
    if (!workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const prospectId = searchParams.get("prospectId");

    if (!prospectId) return NextResponse.json({ error: "prospectId required" }, { status: 400 });

    await prisma.funnelProspect.deleteMany({ where: { prospectId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[funnel/prospects DELETE]", error);
    return NextResponse.json({ error: "Failed to remove prospect" }, { status: 500 });
  }
}
