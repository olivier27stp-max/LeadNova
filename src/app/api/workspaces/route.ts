import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { getActiveWorkspaceId, getWorkspacesForUser } from "@/lib/workspace";

// GET — list user's workspaces + active workspace id
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const workspaces = await getWorkspacesForUser(user.id);
  const activeWorkspaceId = await getActiveWorkspaceId(user.id);

  return NextResponse.json({ workspaces, activeWorkspaceId });
}

// POST — create a new workspace
export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const { name } = await request.json();
  if (!name?.trim()) {
    return NextResponse.json({ error: "Le nom est requis" }, { status: 400 });
  }

  const workspace = await prisma.workspace.create({
    data: {
      name: name.trim(),
      members: {
        create: { userId: user.id, role: "OWNER" },
      },
    },
  });

  return NextResponse.json(workspace, { status: 201 });
}
