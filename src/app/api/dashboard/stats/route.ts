import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getWorkspaceContext } from "@/lib/workspace";
import { startOfDayInTz } from "@/lib/utils";

export async function GET(request: NextRequest) {
  try {
    const ctx = await getWorkspaceContext();
    const workspaceId = ctx?.workspaceId ?? null;

    const tz = request.headers.get("x-timezone") || "America/Montreal";
    const startOfDay = startOfDayInTz(tz);

    // Prospect filter by workspace
    const prospectWhere = {
      archivedAt: null,
      ...(workspaceId ? { workspaceId } : {}),
    };

    // EmailActivity: filter by workspace through prospect relation (avoids huge IN clause)
    const emailWhere = workspaceId
      ? { prospect: { workspaceId, archivedAt: null } }
      : {};

    // Sequential queries to avoid overwhelming the connection pool
    const totalProspects = await prisma.prospect.count({ where: prospectWhere });
    const prospectsByStatus = await prisma.prospect.groupBy({
      by: ["status"],
      where: prospectWhere,
      _count: true,
    });
    const statusMap = Object.fromEntries(
      prospectsByStatus.map((s) => [s.status, s._count])
    );

    const emailsSentToday = await prisma.emailActivity.count({
      where: { ...emailWhere, sentAt: { gte: startOfDay } },
    });
    const totalEmailsSent = await prisma.emailActivity.count({ where: emailWhere });
    const emailReplies = await prisma.emailActivity.count({
      where: { ...emailWhere, replyReceived: true },
    });
    // Include prospects manually set to REPLIED (may not have EmailActivity)
    const statusRepliedCount = statusMap["REPLIED"] || 0;
    const totalReplies = Math.max(emailReplies, statusRepliedCount);
    const totalBounces = await prisma.emailActivity.count({
      where: { ...emailWhere, bounce: true },
    });
    const recentProspects = await prisma.prospect.findMany({
      where: prospectWhere,
      orderBy: { dateDiscovered: "desc" },
      take: 5,
      select: {
        id: true,
        companyName: true,
        city: true,
        status: true,
        leadScore: true,
        dateDiscovered: true,
      },
    });
    const recentEmails = await prisma.emailActivity.findMany({
      where: emailWhere,
      orderBy: { sentAt: "desc" },
      take: 5,
      include: {
        prospect: {
          select: { companyName: true },
        },
      },
    });

    const replyRate =
      totalEmailsSent > 0
        ? ((totalReplies / totalEmailsSent) * 100).toFixed(1)
        : "0";

    const bounceRate =
      totalEmailsSent > 0
        ? ((totalBounces / totalEmailsSent) * 100).toFixed(1)
        : "0";

    return NextResponse.json({
      totalProspects,
      prospectsByStatus: statusMap,
      emailsSentToday,
      totalEmailsSent,
      totalReplies,
      replyRate: `${replyRate}%`,
      bounceRate: `${bounceRate}%`,
      qualifiedLeads: statusMap["QUALIFIED"] || 0,
      recentProspects,
      recentEmails,
    });
  } catch (error) {
    console.error("Dashboard stats error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load stats" },
      { status: 500 }
    );
  }
}
