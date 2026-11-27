import { NextRequest, NextResponse } from "next/server";
import { processSlackQueue } from "@/lib/slack-notifications";

// POST /api/cron/slack-notifications — envoie les notifications Slack en file
export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json(await processSlackQueue());
  } catch (err) {
    console.error("[cron/slack-notifications]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Envoi Slack échoué" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return POST(req);
}
