import { NextResponse } from "next/server";
import { getWorkspaceContext } from "@/lib/workspace";
import { getGmailAuthUrl } from "@/lib/gmail";

// GET /api/auth/gmail — initiate Gmail OAuth flow
export async function GET() {
  try {
    const ctx = await getWorkspaceContext();
    if (!ctx?.workspaceId) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const url = getGmailAuthUrl(ctx.workspaceId);
    return NextResponse.json({ url });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur OAuth" },
      { status: 500 }
    );
  }
}
