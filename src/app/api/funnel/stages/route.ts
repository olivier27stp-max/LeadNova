import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { getSessionUser } from "@/lib/session";
import { getActiveWorkspaceId } from "@/lib/workspace";

async function getWorkspaceId() {
  const user = await getSessionUser();
  if (!user) return null;
  return getActiveWorkspaceId(user.id);
}

const DEFAULT_STAGE_SLUG = "new-replies";

// GET — fetch all stages with prospect counts
export async function GET() {
  try {
    const workspaceId = await getWorkspaceId();
    if (!workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    let stages = await prisma.funnelStage.findMany({
      where: { workspaceId },
      orderBy: { sortOrder: "asc" },
      include: {
        prospects: {
          include: {
            prospect: {
              select: {
                id: true,
                companyName: true,
                email: true,
                phone: true,
                status: true,
                leadScore: true,
                city: true,
                industry: true,
              },
            },
          },
          orderBy: { sortOrder: "asc" },
        },
      },
    });

    // Auto-create default stages if none exist
    if (stages.length === 0) {
      const defaultStages = [
        { name: "New Replies", slug: "new-replies", sortOrder: 0, isDefault: true },
        { name: "Not Interested", slug: "not-interested", sortOrder: 1, isDefault: false },
        { name: "Interested", slug: "interested", sortOrder: 2, isDefault: false },
        { name: "Hot Follow-up #1", slug: "hot-follow-up-1", sortOrder: 3, isDefault: false },
        { name: "Hot Follow-up #2", slug: "hot-follow-up-2", sortOrder: 4, isDefault: false },
        { name: "Lost", slug: "lost", sortOrder: 5, isDefault: false },
        { name: "Closed", slug: "closed", sortOrder: 6, isDefault: false },
      ];
      for (const s of defaultStages) {
        await prisma.funnelStage.create({
          data: { workspaceId, ...s },
        });
      }
      stages = await prisma.funnelStage.findMany({
        where: { workspaceId },
        orderBy: { sortOrder: "asc" },
        include: {
          prospects: {
            include: {
              prospect: {
                select: {
                  id: true,
                  companyName: true,
                  email: true,
                  phone: true,
                  status: true,
                  leadScore: true,
                  city: true,
                  industry: true,
                },
              },
            },
            orderBy: { sortOrder: "asc" },
          },
        },
      });
    }

    return NextResponse.json(stages);
  } catch (error) {
    console.error("[funnel/stages GET]", error);
    return NextResponse.json({ error: "Failed to fetch stages" }, { status: 500 });
  }
}

// POST — create a new stage
export async function POST(request: NextRequest) {
  try {
    const workspaceId = await getWorkspaceId();
    if (!workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { name } = await request.json();
    const stageName = name || "New Stage";

    // Get max sortOrder
    const maxStage = await prisma.funnelStage.findFirst({
      where: { workspaceId },
      orderBy: { sortOrder: "desc" },
    });
    const nextOrder = (maxStage?.sortOrder ?? -1) + 1;

    // Generate unique slug
    const baseSlug = stageName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    let slug = baseSlug;
    let counter = 1;
    while (true) {
      const existing = await prisma.funnelStage.findUnique({
        where: { workspaceId_slug: { workspaceId, slug } },
      });
      if (!existing) break;
      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    const stage = await prisma.funnelStage.create({
      data: {
        workspaceId,
        name: stageName,
        slug,
        sortOrder: nextOrder,
        isDefault: false,
      },
      include: {
        prospects: {
          include: {
            prospect: {
              select: {
                id: true,
                companyName: true,
                email: true,
                phone: true,
                status: true,
                leadScore: true,
                city: true,
                industry: true,
              },
            },
          },
        },
      },
    });

    await logActivity({
      action: "funnel_stage_created",
      type: "success",
      title: `Funnel stage "${stageName}" created`,
      workspaceId,
    });

    return NextResponse.json(stage);
  } catch (error) {
    console.error("[funnel/stages POST]", error);
    return NextResponse.json({ error: "Failed to create stage" }, { status: 500 });
  }
}

// PATCH — update stage (rename, reorder)
export async function PATCH(request: NextRequest) {
  try {
    const workspaceId = await getWorkspaceId();
    if (!workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id, name, sortOrder } = await request.json();

    if (!id) return NextResponse.json({ error: "Stage ID required" }, { status: 400 });

    const stage = await prisma.funnelStage.findFirst({
      where: { id, workspaceId },
    });

    if (!stage) return NextResponse.json({ error: "Stage not found" }, { status: 404 });

    // Prevent renaming default stage
    if (stage.isDefault && name !== undefined) {
      return NextResponse.json({ error: "Cannot rename default stage" }, { status: 400 });
    }

    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = name;
    if (sortOrder !== undefined) data.sortOrder = sortOrder;

    const updated = await prisma.funnelStage.update({
      where: { id },
      data,
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("[funnel/stages PATCH]", error);
    return NextResponse.json({ error: "Failed to update stage" }, { status: 500 });
  }
}

// DELETE — delete a stage (not default)
export async function DELETE(request: NextRequest) {
  try {
    const workspaceId = await getWorkspaceId();
    if (!workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) return NextResponse.json({ error: "Stage ID required" }, { status: 400 });

    const stage = await prisma.funnelStage.findFirst({
      where: { id, workspaceId },
    });

    if (!stage) return NextResponse.json({ error: "Stage not found" }, { status: 404 });
    if (stage.isDefault) return NextResponse.json({ error: "Cannot delete default stage" }, { status: 400 });

    // Delete all funnel prospects in this stage first
    await prisma.funnelProspect.deleteMany({ where: { stageId: id } });
    await prisma.funnelStage.delete({ where: { id } });

    await logActivity({
      action: "funnel_stage_deleted",
      type: "warning",
      title: `Funnel stage "${stage.name}" deleted`,
      workspaceId,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[funnel/stages DELETE]", error);
    return NextResponse.json({ error: "Failed to delete stage" }, { status: 500 });
  }
}
