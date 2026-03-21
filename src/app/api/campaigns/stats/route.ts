import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const period = searchParams.get("period") || "day"; // day | week | month

    const now = new Date();
    let since: Date;

    if (period === "week") {
      since = new Date(now);
      since.setDate(since.getDate() - 7);
      since.setHours(0, 0, 0, 0);
    } else if (period === "month") {
      since = new Date(now);
      since.setDate(since.getDate() - 30);
      since.setHours(0, 0, 0, 0);
    } else {
      // day
      since = new Date(now);
      since.setHours(0, 0, 0, 0);
    }

    const stats = await prisma.emailActivity.groupBy({
      by: ["campaignId"],
      where: {
        campaignId: { not: null },
        sentAt: { gte: since },
      },
      _count: { id: true },
    });

    // Also count emails with no campaign (individual sends)
    const totalCount = await prisma.emailActivity.count({
      where: { sentAt: { gte: since } },
    });

    const byCampaign: Record<string, number> = {};
    for (const s of stats) {
      if (s.campaignId) {
        byCampaign[s.campaignId] = s._count.id;
      }
    }

    return NextResponse.json({ byCampaign, total: totalCount, period });
  } catch (error) {
    console.error("Campaign stats error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch stats" },
      { status: 500 }
    );
  }
}
