import { NextRequest, NextResponse } from "next/server";
import { processWarmup } from "@/lib/warmup";

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await processWarmup();
    return NextResponse.json(result);
  } catch (error) {
    console.error("[cron/warmup]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Warmup failed" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  return POST(request);
}
