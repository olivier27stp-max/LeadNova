import { NextRequest, NextResponse } from "next/server";
import { processAutoFollowUps } from "@/lib/process-scheduled-emails";

const CRON_SECRET = process.env.CRON_SECRET;

function isAuthorized(req: NextRequest): boolean {
  if (!CRON_SECRET) return true; // No secret configured = allow (dev mode)
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${CRON_SECRET}`;
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  console.log("[cron/process-followups] Triggered (POST) at", new Date().toISOString());
  try {
    const result = await processAutoFollowUps();
    if (result.sent > 0 || result.errors.length > 0) {
      console.log("[cron/process-followups] Result:", JSON.stringify(result));
    }
    return NextResponse.json(result);
  } catch (err) {
    console.error("[cron/process-followups] Fatal error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Internal error" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  console.log("[cron/process-followups] Triggered at", new Date().toISOString());
  try {
    const result = await processAutoFollowUps();
    if (result.sent > 0 || result.errors.length > 0) {
      console.log("[cron/process-followups] Result:", JSON.stringify(result));
    }
    return NextResponse.json(result);
  } catch (err) {
    console.error("[cron/process-followups] Fatal error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Internal error" }, { status: 500 });
  }
}
