import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

  // Campaign contacts
  const campaignContacts = await prisma.campaignContact.findMany({
    where: { campaignId },
    select: {
      prospectId: true,
      prospect: { select: { companyName: true, city: true, status: true, email: true } },
    },
  });

  const prospectIds = campaignContacts.map((cc) => cc.prospectId);
  if (prospectIds.length === 0) {
    return NextResponse.json({
      kpis: { sent: 0, delivered: 0, opened: 0, replied: 0, bounced: 0, interested: 0, converted: 0, unsubscribed: 0 },
      rates: { deliveryRate: 0, openRate: 0, replyRate: 0, bounceRate: 0 },
      timeline: [],
      contacts: [],
      totalContacts: 0,
    });
  }

  // Email activities
  const activities = await prisma.emailActivity.findMany({
    where: {
      prospectId: { in: prospectIds },
      ...(dateFrom ? { sentAt: { gte: dateFrom } } : {}),
    },
    select: {
      id: true,
      prospectId: true,
      sentAt: true,
      openedAt: true,
      replyReceived: true,
      bounce: true,
    },
    orderBy: { sentAt: "asc" },
  });

  // KPIs
  const sent = activities.length;
  const bounced = activities.filter((e) => e.bounce).length;
  const delivered = sent - bounced;
  const opened = activities.filter((e) => e.openedAt !== null).length;
  const replied = activities.filter((e) => e.replyReceived).length;
  const interested = campaignContacts.filter((cc) =>
    cc.prospect.status === "REPLIED" || cc.prospect.status === "QUALIFIED"
  ).length;
  const converted = campaignContacts.filter(
    (cc) => cc.prospect.status === "QUALIFIED"
  ).length;

  // Unsubscribes: campaign contacts whose email is in the blacklist
  const contactEmails = campaignContacts
    .map((cc) => cc.prospect.email)
    .filter((e): e is string => !!e);
  const blacklistedEmails = await prisma.blacklist.findMany({
    where: { email: { in: contactEmails } },
    select: { email: true },
  });
  const unsubscribed = blacklistedEmails.length;

  // Rates
  const deliveryRate = sent > 0 ? Math.round((delivered / sent) * 1000) / 10 : 0;
  const openRate = delivered > 0 ? Math.round((opened / delivered) * 1000) / 10 : 0;
  const replyRate = sent > 0 ? Math.round((replied / sent) * 1000) / 10 : 0;
  const bounceRate = sent > 0 ? Math.round((bounced / sent) * 1000) / 10 : 0;

  // Timeline grouped by day
  const timelineMap = new Map<string, { sent: number; opened: number; replied: number; bounced: number }>();
  for (const e of activities) {
    const day = e.sentAt.toISOString().split("T")[0];
    if (!timelineMap.has(day)) timelineMap.set(day, { sent: 0, opened: 0, replied: 0, bounced: 0 });
    const entry = timelineMap.get(day)!;
    entry.sent++;
    if (e.openedAt) entry.opened++;
    if (e.replyReceived) entry.replied++;
    if (e.bounce) entry.bounced++;
  }
  const timeline = Array.from(timelineMap.entries())
    .map(([date, data]) => ({ date, ...data }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Contact-level breakdown
  const contactMap = new Map(campaignContacts.map((cc) => [cc.prospectId, cc.prospect]));

  // Deduplicate: keep latest activity per prospect
  const latestByProspect = new Map<string, typeof activities[0]>();
  for (const e of activities) {
    const existing = latestByProspect.get(e.prospectId);
    if (!existing || e.sentAt > existing.sentAt) latestByProspect.set(e.prospectId, e);
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
  }));

  return NextResponse.json({
    kpis: { sent, delivered, opened, replied, bounced, interested, converted, unsubscribed },
    rates: { deliveryRate, openRate, replyRate, bounceRate },
    timeline,
    contacts,
    totalContacts: campaignContacts.length,
  });
}
