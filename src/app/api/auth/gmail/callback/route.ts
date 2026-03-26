import { NextRequest, NextResponse } from "next/server";
import { exchangeGmailCode, saveGmailTokens } from "@/lib/gmail";

// GET /api/auth/gmail/callback — Google redirects here after consent
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");
    const state = searchParams.get("state"); // workspaceId
    const error = searchParams.get("error");

    if (error) {
      const appUrl = process.env.APP_URL || "";
      return NextResponse.redirect(`${appUrl}/settings?gmail=error&reason=${error}`);
    }

    if (!code || !state) {
      return NextResponse.json({ error: "Code ou state manquant" }, { status: 400 });
    }

    const tokens = await exchangeGmailCode(code);
    await saveGmailTokens(state, tokens);

    const appUrl = process.env.APP_URL
      || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

    return NextResponse.redirect(`${appUrl}/settings?section=email&gmail=connected`);
  } catch (error) {
    console.error("[Gmail OAuth callback]", error);
    const appUrl = process.env.APP_URL || "";
    return NextResponse.redirect(`${appUrl}/settings?gmail=error&reason=token_exchange_failed`);
  }
}
