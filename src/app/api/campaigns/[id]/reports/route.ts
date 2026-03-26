import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireWorkspaceContext, handleWorkspaceError } from "@/lib/workspace";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
  const ctx = await requireWorkspaceContext();
  const { id: campaignId } = await params;
  const { searchParams } = new URL(req.url);
  const range = searchParams.get("range") || "all";

  // Date filter
  let dateFrom: Date | undefined;
  const now = new Date();
  if (range === "today") {
    dateFrom = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  } else if (range === "7d") {
    dateFrom = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  } else if (range === "30d") {
    dateFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }

  // Verify campaign belongs to workspace
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, workspaceId: ctx.workspaceId },
    select: { id: true },
  });
  if (!campaign) {
    return NextResponse.json({ error: "Campagne introuvable" }, { status: 404 });
  }

  // Campaign contacts
  const campaignContacts = await prisma.campaignContact.findMany({
    where: { campaignId },
    select: {
      prospectId: true,
      prospect: { select: { companyName: true, city: true, status: true, email: true } },
    },
  });

  const prospectIds = campaignContacts.map((cc) => cc.prospectId);

  // Email activities — always query by campaignId; also include orphaned activities by prospectId
  const activities = await prisma.emailActivity.findMany({
    where: {
      OR: [
        { campaignId },
        ...(prospectIds.length > 0 ? [{ prospectId: { in: prospectIds }, campaignId: null }] : []),
      ],
      ...(dateFrom ? { sentAt: { gte: dateFrom } } : {}),
    },
    select: {
      id: true,
      prospectId: true,
      sentAt: true,
      openedAt: true,
      replyReceived: true,
      bounce: true,
      unsubscribed: true,
      isFollowUp: true,
      followUpIndex: true,
    },
    orderBy: { sentAt: "asc" },
  });

  if (activities.length === 0 && prospectIds.length === 0) {
    return NextResponse.json({
      kpis: { sent: 0, delivered: 0, opened: 0, replied: 0, bounced: 0, interested: 0, converted: 0, unsubscribed: 0 },
      rates: { deliveryRate: 0, openRate: 0, replyRate: 0, bounceRate: 0, unsubscribeRate: 0 },
      timeline: [],
      contacts: [],
      totalContacts: 0,
    });
  }

  // If CampaignContact is empty, reconstruct prospect IDs from activities
  const activityProspectIds = [...new Set(activities.map((a) => a.prospectId))];
  const effectiveProspectIds = prospectIds.length > 0 ? prospectIds : activityProspectIds;

  // Split initial vs follow-up activities
  const initialActivities = activities.filter((e) => !e.isFollowUp);
  const followUpActivities = activities.filter((e) => e.isFollowUp);

  // KPIs (all)
  const sent = activities.length;
  const bounced = activities.filter((e) => e.bounce).length;
  const delivered = sent - bounced;
  const opened = activities.filter((e) => e.openedAt !== null).length;
  const replied = activities.filter((e) => e.replyReceived).length;

  // KPIs (initial only)
  const initialSent = initialActivities.length;
  const initialBounced = initialActivities.filter((e) => e.bounce).length;
  const initialDelivered = initialSent - initialBounced;
  const initialOpened = initialActivities.filter((e) => e.openedAt !== null).length;
  const initialReplied = initialActivities.filter((e) => e.replyReceived).length;

  // KPIs (follow-ups only)
  const followUpSent = followUpActivities.length;
  const followUpBounced = followUpActivities.filter((e) => e.bounce).length;
  const followUpDelivered = followUpSent - followUpBounced;
  const followUpOpened = followUpActivities.filter((e) => e.openedAt !== null).length;
  const followUpReplied = followUpActivities.filter((e) => e.replyReceived).length;
  // Load prospect details for contacts not in CampaignContact (fallback from activities)
  const missingProspectIds = effectiveProspectIds.filter((id) => !campaignContacts.some((cc) => cc.prospectId === id));
  const fallbackProspects = missingProspectIds.length > 0
    ? await prisma.prospect.findMany({
        where: { id: { in: missingProspectIds } },
        select: { id: true, companyName: true, city: true, status: true, email: true },
      })
    : [];

  // Merge all prospect data: CampaignContact prospects + fallback prospects
  const allProspectData = new Map<string, { companyName: string; city: string | null; status: string; email: string | null }>();
  for (const cc of campaignContacts) {
    allProspectData.set(cc.prospectId, cc.prospect);
  }
  for (const p of fallbackProspects) {
    allProspectData.set(p.id, p);
  }

  const interested = Array.from(allProspectData.values()).filter(
    (p) => p.status === "REPLIED" || p.status === "QUALIFIED"
  ).length;
  const converted = Array.from(allProspectData.values()).filter(
    (p) => p.status === "QUALIFIED"
  ).length;

  // Unsubscribes: from EmailActivity unsubscribed field
  const unsubscribed = activities.filter((e) => e.unsubscribed).length;

  // Rates
  const deliveryRate = sent > 0 ? Math.round((delivered / sent) * 1000) / 10 : 0;
  const openRate = delivered > 0 ? Math.round((opened / delivered) * 1000) / 10 : 0;
  const replyRate = sent > 0 ? Math.round((replied / sent) * 1000) / 10 : 0;
  const bounceRate = sent > 0 ? Math.round((bounced / sent) * 1000) / 10 : 0;
  const unsubscribeRate = sent > 0 ? Math.round((unsubscribed / sent) * 1000) / 10 : 0;

  // Timeline grouped by day (with follow-up breakdown)
  const timelineMap = new Map<string, { sent: number; opened: number; replied: number; bounced: number; followUpSent: number; followUpOpened: number; followUpReplied: number }>();
  for (const e of activities) {
    const day = e.sentAt.toISOString().split("T")[0];
    if (!timelineMap.has(day)) timelineMap.set(day, { sent: 0, opened: 0, replied: 0, bounced: 0, followUpSent: 0, followUpOpened: 0, followUpReplied: 0 });
    const entry = timelineMap.get(day)!;
    entry.sent++;
    if (e.openedAt) entry.opened++;
    if (e.replyReceived) entry.replied++;
    if (e.bounce) entry.bounced++;
    if (e.isFollowUp) {
      entry.followUpSent++;
      if (e.openedAt) entry.followUpOpened++;
      if (e.replyReceived) entry.followUpReplied++;
    }
  }
  const timeline = Array.from(timelineMap.entries())
    .map(([date, data]) => ({ date, ...data }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Contact-level breakdown
  const contactMap = allProspectData;

  // Deduplicate: keep latest activity per prospect
  const latestByProspect = new Map<string, typeof activities[0]>();
  for (const e of activities) {
    const existing = latestByProspect.get(e.prospectId);
    if (!existing || e.sentAt > existing.sentAt) latestByProspect.set(e.prospectId, e);
  }

  // Count emails per prospect (for follow-up breakdown)
  const emailCountByProspect = new Map<string, number>();
  const followUpCountByProspect = new Map<string, number>();
  for (const e of activities) {
    emailCountByProspect.set(e.prospectId, (emailCountByProspect.get(e.prospectId) || 0) + 1);
    if (e.isFollowUp) {
      followUpCountByProspect.set(e.prospectId, (followUpCountByProspect.get(e.prospectId) || 0) + 1);
    }
  }

  const contacts = Array.from(latestByProspect.values()).map((e) => ({
    prospectId: e.prospectId,
    companyName: contactMap.get(e.prospectId)?.companyName ?? "—",
    city: contactMap.get(e.prospectId)?.city ?? null,
    status: contactMap.get(e.prospectId)?.status ?? "NEW",
    email: contactMap.get(e.prospectId)?.email ?? null,
    sentAt: e.sentAt,
    openedAt: e.openedAt,
    replyReceived: e.replyReceived,
    bounce: e.bounce,
    unsubscribed: e.unsubscribed,
    isFollowUp: e.isFollowUp,
    followUpIndex: e.followUpIndex,
    totalEmails: emailCountByProspect.get(e.prospectId) || 1,
    totalFollowUps: followUpCountByProspect.get(e.prospectId) || 0,
  }));

  // Follow-up rates
  const followUpOpenRate = followUpDelivered > 0 ? Math.round((followUpOpened / followUpDelivered) * 1000) / 10 : 0;
  const followUpReplyRate = followUpSent > 0 ? Math.round((followUpReplied / followUpSent) * 1000) / 10 : 0;

  return NextResponse.json({
    kpis: { sent, delivered, opened, replied, bounced, interested, converted, unsubscribed },
    rates: { deliveryRate, openRate, replyRate, bounceRate, unsubscribeRate },
    initial: {
      sent: initialSent,
      delivered: initialDelivered,
      opened: initialOpened,
      replied: initialReplied,
      bounced: initialBounced,
      openRate: initialDelivered > 0 ? Math.round((initialOpened / initialDelivered) * 1000) / 10 : 0,
      replyRate: initialSent > 0 ? Math.round((initialReplied / initialSent) * 1000) / 10 : 0,
    },
    followUp: {
      sent: followUpSent,
      delivered: followUpDelivered,
      opened: followUpOpened,
      replied: followUpReplied,
      bounced: followUpBounced,
      openRate: followUpOpenRate,
      replyRate: followUpReplyRate,
    },
    timeline,
    contacts,
    totalContacts: allProspectData.size,
  });
  } catch (error) {
    return handleWorkspaceError(error);
  }
}
