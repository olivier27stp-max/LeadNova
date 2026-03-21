import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getWorkspaceContext } from "@/lib/workspace";
import { logActivity } from "@/lib/activity";

// GET /api/calendar/tasks
export async function GET(request: NextRequest) {
  try {
    const ctx = await getWorkspaceContext();
    const workspaceId = ctx?.workspaceId ?? null;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");

    const where: Record<string, unknown> = {};
    if (workspaceId) where.workspaceId = workspaceId;
    if (status) where.status = status;

    const tasks = await prisma.calendarTask.findMany({
      where,
      orderBy: { dueAt: "asc" },
    });

    return NextResponse.json(tasks);
  } catch (error) {
    console.error("Calendar tasks fetch error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch tasks" },
      { status: 500 }
    );
  }
}

// POST /api/calendar/tasks
export async function POST(request: NextRequest) {
  try {
    const ctx = await getWorkspaceContext();
    const workspaceId = ctx?.workspaceId ?? null;
    const userId = ctx?.userId ?? null;

    const body = await request.json();
    const { title, description, dueAt, priority, status, prospectId, campaignId } = body;

    if (!title || !dueAt) {
      return NextResponse.json({ error: "title et dueAt requis" }, { status: 400 });
    }

    const task = await prisma.calendarTask.create({
      data: {
        workspaceId,
        userId,
        title,
        description: description || null,
        dueAt: new Date(dueAt),
        priority: priority || "MEDIUM",
        status: status || "TODO",
        prospectId: prospectId || null,
        campaignId: campaignId || null,
      },
    });

    await logActivity({
      workspaceId: workspaceId || undefined,
      action: "task_created",
      type: "info",
      title: `Tâche créée: ${title}`,
      userId: userId || undefined,
    });

    return NextResponse.json(task, { status: 201 });
  } catch (error) {
    console.error("Calendar task create error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create task" },
      { status: 500 }
    );
  }
}
