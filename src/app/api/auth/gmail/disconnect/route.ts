import { NextResponse } from "next/server";
import { getWorkspaceContext } from "@/lib/workspace";
import { clearGmailTokens, loadGmailTokens } from "@/lib/gmail";

// POST /api/auth/gmail/disconnect — remove Gmail OAuth tokens
export async function POST() {
  try {
    const ctx = await getWorkspaceContext();
    if (!ctx?.workspaceId) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    // Try to revoke token at Google
    const tokens = await loadGmailTokens(ctx.workspaceId);
    if (tokens?.access_token) {
      try {
        await fetch(`https://oauth2.googleapis.com/revoke?token=${tokens.access_token}`, {
          method: "POST",
        });
      } catch {
        // Revoke is best-effort
      }
    }

    await clearGmailTokens(ctx.workspaceId);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur" },
      { status: 500 }
    );
  }
}
