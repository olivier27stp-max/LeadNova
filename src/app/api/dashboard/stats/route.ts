import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getWorkspaceContext } from "@/lib/workspace";

export async function GET() {
  try {
    const ctx = await getWorkspaceContext();
    const workspaceId = ctx?.workspaceId ?? null;

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    // Prospect filter by workspace
    const prospectWhere = {
      archivedAt: null,
      ...(workspaceId ? { workspaceId } : {}),
    };

    // EmailActivity joins through prospect, filter by workspace via prospectId
    // We get prospect IDs for this workspace first, then filter email activities
    const workspaceProspectIds = workspaceId
      ? await prisma.prospect.findMany({
          where: { workspaceId, archivedAt: null },
          select: { id: true },
        }).then((ps) => ps.map((p) => p.id))
      : null;

    const emailWhere = workspaceProspectIds
      ? { prospectId: { in: workspaceProspectIds } }
      : {};

    // Sequential queries to avoid overwhelming the connection pool
    const totalProspects = await prisma.prospect.count({ where: prospectWhere });
    const prospectsByStatus = await prisma.prospect.groupBy({
      by: ["status"],
      where: prospectWhere,
      _count: true,
    });
    const emailsSentToday = await prisma.emailActivity.count({
      where: { ...emailWhere, sentAt: { gte: startOfDay } },
    });
    const totalEmailsSent = await prisma.emailActivity.count({ where: emailWhere });
    const totalReplies = await prisma.emailActivity.count({
      where: { ...emailWhere, replyReceived: true },
    });
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

    const statusMap = Object.fromEntries(
      prospectsByStatus.map((s) => [s.status, s._count])
    );

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
