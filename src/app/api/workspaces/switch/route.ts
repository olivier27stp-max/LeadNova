import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { setWorkspaceCookie } from "@/lib/workspace";
import { prisma } from "@/lib/db";

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const { workspaceId } = await request.json();
  if (!workspaceId) return NextResponse.json({ error: "workspaceId requis" }, { status: 400 });

  // Verify membership
  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: user.id } },
  });
  if (!member) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

  const res = NextResponse.json({ ok: true });
  setWorkspaceCookie(res, workspaceId);
  return res;
}
