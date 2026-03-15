import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireWorkspaceContext, handleWorkspaceError } from "@/lib/workspace";

// GET — list workspace members (not all users globally)
export async function GET() {
  try {
    const { workspaceId } = await requireWorkspaceContext();

    const members = await prisma.workspaceMember.findMany({
      where: { workspaceId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            active: true,
            lastActiveAt: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    // Return flat user objects with workspaceRole attached
    const result = members.map((m) => ({
      ...m.user,
      workspaceRole: m.role,
      memberId: m.id,
    }));

    return NextResponse.json(result);
  } catch (error) {
    return handleWorkspaceError(error);
  }
}

// PATCH — update a workspace member's role (workspace-scoped)
export async function PATCH(request: NextRequest) {
  try {
    const { workspaceId, userId: currentUserId } = await requireWorkspaceContext();
    const body = await request.json();
    const { id, workspaceRole } = body;

    if (!id) {
      return NextResponse.json({ error: "id requis" }, { status: 400 });
    }

    // Verify target user is in this workspace
    const member = await prisma.workspaceMember.findFirst({
      where: { workspaceId, userId: id },
    });
    if (!member) {
      return NextResponse.json({ error: "Membre introuvable" }, { status: 404 });
    }

    // Prevent changing own role
    if (id === currentUserId) {
      return NextResponse.json({ error: "Vous ne pouvez pas modifier votre propre rôle" }, { status: 400 });
    }

    // Update workspace role
    if (workspaceRole) {
      await prisma.workspaceMember.update({
        where: { id: member.id },
        data: { role: workspaceRole },
      });
    }

    await prisma.activityLog.create({
      data: {
        workspaceId,
        action: "member_updated",
        details: `Rôle modifié pour le membre ${id}`,
        userId: currentUserId,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleWorkspaceError(error);
  }
}

// DELETE — remove a member from the workspace
export async function DELETE(request: NextRequest) {
  try {
    const { workspaceId, userId: currentUserId } = await requireWorkspaceContext();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "id requis" }, { status: 400 });
    }

    // Cannot remove yourself
    if (id === currentUserId) {
      return NextResponse.json({ error: "Vous ne pouvez pas vous retirer vous-même" }, { status: 400 });
    }

    // Find workspace membership
    const member = await prisma.workspaceMember.findFirst({
      where: { workspaceId, userId: id },
    });
    if (!member) {
      return NextResponse.json({ error: "Membre introuvable" }, { status: 404 });
    }

    // Cannot remove the OWNER
    if (member.role === "OWNER") {
      return NextResponse.json({ error: "Impossible de retirer le propriétaire" }, { status: 400 });
    }

    await prisma.workspaceMember.delete({ where: { id: member.id } });

    await prisma.activityLog.create({
      data: {
        workspaceId,
        action: "member_removed",
        details: `Membre retiré: ${id}`,
        userId: currentUserId,
      },
    });

    return NextResponse.json({ deleted: true });
  } catch (error) {
    return handleWorkspaceError(error);
  }
}
