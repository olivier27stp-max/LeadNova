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
  const result = await processAutoFollowUps();
  return NextResponse.json(result);
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const result = await processAutoFollowUps();
  return NextResponse.json(result);
}
