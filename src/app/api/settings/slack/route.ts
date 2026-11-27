import { NextRequest, NextResponse } from "next/server";
import { requireWorkspaceContext, handleWorkspaceError, WorkspaceError } from "@/lib/workspace";
import { isWorkspaceAdmin, readSlackSettings, sendSlackTest, updateSlackSettings } from "@/lib/slack-notifications";

// Paramètres → Automatisation → Notifications internes → Slack.
// Réservé aux OWNER/ADMIN de l'espace de travail actif ; l'URL du webhook n'est jamais renvoyée en clair.

async function requireSlackAdmin() {
  const ctx = await requireWorkspaceContext();
  if (!(await isWorkspaceAdmin(ctx.userId, ctx.workspaceId))) {
    throw new WorkspaceError(403, "Réservé aux administrateurs de l'espace de travail");
  }
  return ctx;
}

// GET /api/settings/slack
export async function GET() {
  try {
    const ctx = await requireSlackAdmin();
    return NextResponse.json(await readSlackSettings(ctx.workspaceId));
  } catch (error) {
    return handleWorkspaceError(error);
  }
}

// PUT /api/settings/slack — { enabled?, webhookUrl?, threshold?, events?, includeExcerpt? }
export async function PUT(request: NextRequest) {
  try {
    const ctx = await requireSlackAdmin();
    const body = await request.json().catch(() => ({}));
    const res = await updateSlackSettings(ctx.workspaceId, body ?? {}, ctx.userId);
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
    return NextResponse.json(res.settings);
  } catch (error) {
    return handleWorkspaceError(error);
  }
}

// POST /api/settings/slack — « Envoyer un test » (URL saisie, sinon celle enregistrée)
export async function POST(request: NextRequest) {
  try {
    const ctx = await requireSlackAdmin();
    const body = await request.json().catch(() => ({}));
    const res = await sendSlackTest(ctx.workspaceId, body?.webhookUrl);
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleWorkspaceError(error);
  }
}
