import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "./db";
import { getSessionUser } from "./session";

const WORKSPACE_COOKIE = "fl_workspace";

// ─── Cookie helpers ────────────────────────────────────────

export function setWorkspaceCookie(res: NextResponse, workspaceId: string): void {
  res.cookies.set(WORKSPACE_COOKIE, workspaceId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
  });
}

// ─── Active workspace resolution ──────────────────────────
// Reads fl_workspace cookie, validates membership, falls back to first workspace.

export async function getActiveWorkspaceId(userId: string): Promise<string | null> {
  const cookieStore = await cookies();
  const cookieWsId = cookieStore.get(WORKSPACE_COOKIE)?.value;

  if (cookieWsId) {
    const member = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: cookieWsId, userId } },
    });
    if (member) return cookieWsId;
  }

  // Fall back to first workspace the user is member of
  const firstMember = await prisma.workspaceMember.findFirst({
    where: { userId },
    orderBy: { createdAt: "asc" },
  });
  return firstMember?.workspaceId ?? null;
}

// ─── Workspace context (user + active workspace) ──────────
// Convenience helper for API routes: returns { userId, workspaceId } or null if not authenticated.

export async function getWorkspaceContext(): Promise<{ userId: string; workspaceId: string } | null> {
  const user = await getSessionUser();
  if (!user) return null;
  const workspaceId = await getActiveWorkspaceId(user.id);
  if (!workspaceId) return null;
  return { userId: user.id, workspaceId };
}

// ─── Strict workspace context (throws on failure) ────────
// Use in API routes that require authentication + workspace.

export async function requireWorkspaceContext(): Promise<{ userId: string; workspaceId: string }> {
  const user = await getSessionUser();
  if (!user) throw new WorkspaceError(401, "Non authentifié");
  const workspaceId = await getActiveWorkspaceId(user.id);
  if (!workspaceId) throw new WorkspaceError(403, "Aucun espace de travail actif");
  return { userId: user.id, workspaceId };
}

export class WorkspaceError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function handleWorkspaceError(error: unknown): NextResponse {
  if (error instanceof WorkspaceError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  return NextResponse.json(
    { error: error instanceof Error ? error.message : "Erreur serveur" },
    { status: 500 }
  );
}

// ─── Full workspaces list for a user ───────────────────────

export async function getWorkspacesForUser(userId: string) {
  const memberships = await prisma.workspaceMember.findMany({
    where: { userId },
    include: { workspace: true },
    orderBy: { createdAt: "asc" },
  });
  return memberships.map((m) => ({
    id: m.workspace.id,
    name: m.workspace.name,
    role: m.role,
    createdAt: m.workspace.createdAt,
  }));
}
