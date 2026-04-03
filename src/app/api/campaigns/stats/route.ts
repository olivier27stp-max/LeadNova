import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getWorkspaceContext } from "@/lib/workspace";
import { startOfDayInTz } from "@/lib/utils";

export async function GET(request: NextRequest) {
  try {
    const ctx = await getWorkspaceContext();
    const workspaceId = ctx?.workspaceId ?? null;

    const { searchParams } = new URL(request.url);
    const period = searchParams.get("period") || "day";
    const tz = request.headers.get("x-timezone") || "America/Montreal";

    let since: Date;
    if (period === "week") {
      since = startOfDayInTz(tz, 7);
    } else if (period === "month") {
      since = startOfDayInTz(tz, 30);
    } else {
      since = startOfDayInTz(tz);
    }

    // Get campaigns belonging to this workspace
    const workspaceCampaignIds = workspaceId
      ? (await prisma.campaign.findMany({
          where: { workspaceId },
          select: { id: true },
        })).map((c) => c.id)
      : [];

    const stats = await prisma.emailActivity.groupBy({
      by: ["campaignId"],
      where: {
        campaignId: { not: null, in: workspaceCampaignIds },
        sentAt: { gte: since },
      },
      _count: { id: true },
    });

    const totalCount = await prisma.emailActivity.count({
      where: {
        sentAt: { gte: since },
        ...(workspaceCampaignIds.length > 0
          ? { OR: [{ campaignId: { in: workspaceCampaignIds } }, { campaignId: null }] }
          : {}),
      },
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
