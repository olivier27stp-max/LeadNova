import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireWorkspaceContext, handleWorkspaceError } from "@/lib/workspace";
import { randomBytes } from "crypto";

// GET — list active invitations for the current workspace
export async function GET() {
  try {
    const { workspaceId } = await requireWorkspaceContext();

    const invitations = await prisma.workspaceInvitation.findMany({
      where: { workspaceId, usedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(invitations);
  } catch (error) {
    return handleWorkspaceError(error);
  }
}

// POST — generate a new invitation link
export async function POST(request: NextRequest) {
  try {
    const { workspaceId, userId } = await requireWorkspaceContext();
    const body = await request.json().catch(() => ({}));
    const role = body.role === "ADMIN" ? "ADMIN" : "MEMBER";

    // Generate a URL-safe token
    const token = randomBytes(32).toString("base64url");

    // Expire in 7 days
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const invitation = await prisma.workspaceInvitation.create({
      data: {
        workspaceId,
        token,
        role,
        createdById: userId,
        expiresAt,
      },
    });

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || "";
    const inviteUrl = `${baseUrl}/invite/${token}`;

    await prisma.activityLog.create({
      data: {
        workspaceId,
        action: "invite_created",
        title: "Lien d'invitation créé",
        details: `Rôle: ${role}, expire le ${expiresAt.toLocaleDateString("fr-CA")}`,
        userId,
      },
    });

    return NextResponse.json({ invitation, inviteUrl }, { status: 201 });
  } catch (error) {
    console.error("POST /api/workspaces/invite error:", error);
    return handleWorkspaceError(error);
  }
}

// DELETE — revoke an invitation
export async function DELETE(request: NextRequest) {
  try {
    const { workspaceId } = await requireWorkspaceContext();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "id requis" }, { status: 400 });
    }

    // Ensure the invitation belongs to this workspace
    const invitation = await prisma.workspaceInvitation.findFirst({
      where: { id, workspaceId },
    });
    if (!invitation) {
      return NextResponse.json({ error: "Invitation introuvable" }, { status: 404 });
    }

    await prisma.workspaceInvitation.delete({ where: { id } });

    return NextResponse.json({ deleted: true });
  } catch (error) {
    return handleWorkspaceError(error);
  }
}
