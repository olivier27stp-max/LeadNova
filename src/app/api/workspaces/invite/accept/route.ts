import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { setWorkspaceCookie } from "@/lib/workspace";

// POST — accept an invitation (user must be logged in)
export async function POST(request: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const body = await request.json();
    const { token } = body;

    if (!token) {
      return NextResponse.json({ error: "Token requis" }, { status: 400 });
    }

    // Find the invitation
    const invitation = await prisma.workspaceInvitation.findUnique({
      where: { token },
      include: { workspace: { select: { id: true, name: true } } },
    });

    if (!invitation) {
      return NextResponse.json({ error: "Invitation invalide ou expirée" }, { status: 404 });
    }

    if (invitation.usedAt) {
      return NextResponse.json({ error: "Cette invitation a déjà été utilisée" }, { status: 400 });
    }

    if (invitation.expiresAt < new Date()) {
      return NextResponse.json({ error: "Cette invitation a expiré" }, { status: 400 });
    }

    // Check if user is already a member
    const existingMember = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: invitation.workspaceId, userId: user.id } },
    });

    if (existingMember) {
      // Already a member — just switch to this workspace
      const res = NextResponse.json({
        ok: true,
        alreadyMember: true,
        workspace: invitation.workspace,
      });
      setWorkspaceCookie(res, invitation.workspaceId);
      return res;
    }

    // Add user as member with the invitation's role
    await prisma.workspaceMember.create({
      data: {
        workspaceId: invitation.workspaceId,
        userId: user.id,
        role: invitation.role,
      },
    });

    // Mark invitation as used
    await prisma.workspaceInvitation.update({
      where: { id: invitation.id },
      data: { usedAt: new Date(), usedById: user.id },
    });

    await prisma.activityLog.create({
      data: {
        workspaceId: invitation.workspaceId,
        action: "member_joined",
        title: "Nouveau membre",
        details: `${user.name} a rejoint l'espace de travail via invitation`,
        userId: user.id,
      },
    });

    // Switch the user's active workspace to the one they just joined
    const res = NextResponse.json({
      ok: true,
      alreadyMember: false,
      workspace: invitation.workspace,
    });
    setWorkspaceCookie(res, invitation.workspaceId);
    return res;
  } catch (error) {
    console.error("Accept invite error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur serveur" },
      { status: 500 }
    );
  }
}
