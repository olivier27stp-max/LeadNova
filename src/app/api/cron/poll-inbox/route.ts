import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { pollImapForUpdates } from "@/lib/imap-poller";

// POST /api/cron/poll-inbox — poll IMAP for replies & bounces
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const allSettings = await prisma.appSettings.findMany({
      where: { workspaceId: { not: null } },
      select: { workspaceId: true, data: true },
    });

    let totalReplies = 0;
    let totalBounces = 0;
    const errors: string[] = [];

    for (const setting of allSettings) {
      if (!setting.workspaceId) continue;

      const data = setting.data as Record<string, unknown>;
      const emailSettings = (data?.email || {}) as Record<string, string>;

      // Skip gmail_oauth (handled by poll-gmail) and unconfigured
      if (emailSettings.provider === "gmail_oauth") continue;
      if (!emailSettings.smtpHost && !emailSettings.imapHost) continue;

      try {
        const result = await pollImapForUpdates(setting.workspaceId);
        totalReplies += result.replies;
        totalBounces += result.bounces;
        if (result.errors.length > 0) errors.push(...result.errors);
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
    console.error("[cron/poll-inbox]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Poll failed" },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  return POST(req);
}
