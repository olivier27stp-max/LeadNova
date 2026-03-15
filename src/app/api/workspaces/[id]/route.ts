import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/session";

async function getMembership(workspaceId: string, userId: string) {
  return prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
  });
}

// PATCH — rename workspace (OWNER or ADMIN only)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const { id } = await params;
  const member = await getMembership(id, user.id);
  if (!member || (member.role !== "OWNER" && member.role !== "ADMIN")) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  const { name } = await request.json();
  if (!name?.trim()) return NextResponse.json({ error: "Nom requis" }, { status: 400 });

  const workspace = await prisma.workspace.update({
    where: { id },
    data: { name: name.trim() },
  });
  return NextResponse.json(workspace);
}

// DELETE — delete workspace (OWNER only, can't delete last workspace)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const { id } = await params;
  const member = await getMembership(id, user.id);
  if (!member || member.role !== "OWNER") {
    return NextResponse.json({ error: "Seul le propriétaire peut supprimer ce workspace" }, { status: 403 });
  }

  // Prevent deleting the user's only workspace
  const count = await prisma.workspaceMember.count({ where: { userId: user.id } });
  if (count <= 1) {
    return NextResponse.json(
      { error: "Impossible de supprimer votre seul workspace" },
      { status: 400 }
    );
  }

  await prisma.workspace.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
