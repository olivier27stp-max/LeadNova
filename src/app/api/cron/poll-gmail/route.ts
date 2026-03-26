import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { pollGmailForUpdates } from "@/lib/gmail";

// POST /api/cron/poll-gmail — poll Gmail for bounces & replies
export async function POST(req: NextRequest) {
  // Verify cron secret
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Find all workspaces with gmail_oauth provider
    const allSettings = await prisma.appSettings.findMany({
      where: { workspaceId: { not: null } },
      select: { workspaceId: true, data: true },
    });

    let totalReplies = 0;
    let totalBounces = 0;
    const errors: string[] = [];

    for (const setting of allSettings) {
      const data = setting.data as Record<string, unknown>;
      const emailSettings = (data?.email || {}) as Record<string, unknown>;

      if (emailSettings.provider !== "gmail_oauth" || !emailSettings.gmailTokens) continue;
      if (!setting.workspaceId) continue;

      try {
        const result = await pollGmailForUpdates(setting.workspaceId);
        totalReplies += result.replies;
        totalBounces += result.bounces;
      } catch (err) {
        errors.push(`${setting.workspaceId}: ${err instanceof Error ? err.message : "Unknown error"}`);
      }
    }

    return NextResponse.json({
      replies: totalReplies,
      bounces: totalBounces,
      errors,
    });
  } catch (error) {
    console.error("[cron/poll-gmail]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Poll failed" },
      { status: 500 }
    );
  }
}

// Also support GET for Vercel cron
export async function GET(req: NextRequest) {
  return POST(req);
}
