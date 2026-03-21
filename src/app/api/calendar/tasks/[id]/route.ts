import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { getWorkspaceContext } from "@/lib/workspace";

// PUT /api/calendar/tasks/[id]
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { title, description, dueAt, priority, status, prospectId, campaignId } = body;

    const data: Record<string, unknown> = {};
    if (title !== undefined) data.title = title;
    if (description !== undefined) data.description = description;
    if (dueAt !== undefined) data.dueAt = new Date(dueAt);
    if (priority !== undefined) data.priority = priority;
    if (status !== undefined) data.status = status;
    if (prospectId !== undefined) data.prospectId = prospectId || null;
    if (campaignId !== undefined) data.campaignId = campaignId || null;

    const task = await prisma.calendarTask.update({
      where: { id },
      data,
    });

    return NextResponse.json(task);
  } catch (error) {
    console.error("Calendar task update error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update task" },
      { status: 500 }
    );
  }
}

// DELETE /api/calendar/tasks/[id]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getWorkspaceContext();

    await prisma.calendarTask.delete({ where: { id } });

    await logActivity({
      workspaceId: ctx?.workspaceId || undefined,
      action: "task_deleted",
      type: "info",
      title: "Tâche supprimée",
      userId: ctx?.userId || undefined,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Calendar task delete error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete task" },
      { status: 500 }
    );
  }
}
