import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getWorkspaceContext } from "@/lib/workspace";

export interface CalendarEvent {
  id: string;
  title: string;
  type: "followup" | "scheduled_email" | "task";
  start: string;
  end?: string;
  status?: string;
  description?: string;
  campaignId?: string;
  campaignName?: string;
  priority?: string;
  relatedProspects?: Array<{
    id: string;
    companyName: string;
    email: string | null;
    phone: string | null;
  }>;
}

// GET /api/calendar/events?from=...&to=...&types=followup,scheduled_email,task
export async function GET(request: NextRequest) {
  try {
    const ctx = await getWorkspaceContext();
    const workspaceId = ctx?.workspaceId ?? null;

    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const typesParam = searchParams.get("types");

    if (!from || !to) {
      return NextResponse.json({ error: "from and to required" }, { status: 400 });
    }

    const fromDate = new Date(from);
    const toDate = new Date(to);
    const types = typesParam ? typesParam.split(",") : ["followup", "scheduled_email", "task"];

    const events: CalendarEvent[] = [];

    // 1. Scheduled Emails
    if (types.includes("scheduled_email")) {
      const scheduledEmails = await prisma.scheduledEmail.findMany({
        where: {
          ...(workspaceId ? { workspaceId } : {}),
          scheduledFor: { gte: fromDate, lte: toDate },
        },
        orderBy: { scheduledFor: "asc" },
      });

      // Pre-fetch campaigns and prospects in bulk to avoid N+1
      const seCampaignIds = [...new Set(scheduledEmails.map((se) => se.campaignId).filter(Boolean))] as string[];
      const seProspectIds = [...new Set(scheduledEmails.map((se) => se.prospectId).filter(Boolean))] as string[];

      const seCampaigns = seCampaignIds.length > 0
        ? await prisma.campaign.findMany({
            where: { id: { in: seCampaignIds } },
            select: { id: true, name: true, contacts: { select: { prospect: { select: { id: true, companyName: true, email: true, phone: true } } } } },
          })
        : [];
      const seCampaignMap = new Map(seCampaigns.map((c) => [c.id, c]));

      const seProspects = seProspectIds.length > 0
        ? await prisma.prospect.findMany({
            where: { id: { in: seProspectIds } },
            select: { id: true, companyName: true, email: true, phone: true },
          })
        : [];
      const seProspectMap = new Map(seProspects.map((p) => [p.id, p]));

      for (const se of scheduledEmails) {
        let campaignName: string | undefined;
        let prospects: CalendarEvent["relatedProspects"] = [];

        if (se.campaignId) {
          const campaign = seCampaignMap.get(se.campaignId);
          if (campaign) {
            campaignName = campaign.name;
            prospects = campaign.contacts.map((c) => c.prospect);
          }
        }

        if (se.prospectId && prospects.length === 0) {
          const prospect = seProspectMap.get(se.prospectId);
          if (prospect) prospects = [prospect];
        }

        events.push({
          id: `se_${se.id}`,
          title: se.subject || (campaignName ? `Email: ${campaignName}` : "Scheduled Email"),
          type: "scheduled_email",
          start: se.scheduledFor.toISOString(),
          status: se.status,
          description: se.body?.substring(0, 200) || undefined,
          campaignId: se.campaignId || undefined,
          campaignName,
          relatedProspects: prospects,
        });
      }
    }

    // 2. Follow-ups (campaigns with followUpSubject set)
    //    Shows multiple follow-ups (#1, #2, #3) based on settings
    //    Works for both already-sent campaigns AND scheduled future sends
    if (types.includes("followup")) {
      // Load automation settings once
      let followUpDelayDays = 3;
      let followUpIntervalDays = 5;
      let maxFollowUps = 3;
      let shouldSkipWeekends = true;
      if (workspaceId) {
        const settingsRow = await prisma.appSettings.findUnique({ where: { workspaceId } });
        const settings = (settingsRow?.data as Record<string, unknown>) || {};
        const automation = (settings.automation as Record<string, unknown>) || {};
        if (automation.followUpDelayDays) followUpDelayDays = parseInt(String(automation.followUpDelayDays), 10) || 3;
        if (automation.followUpIntervalDays) followUpIntervalDays = parseInt(String(automation.followUpIntervalDays), 10) || 5;
        if (automation.maxFollowUps) maxFollowUps = parseInt(String(automation.maxFollowUps), 10) || 3;
        if (automation.skipWeekends !== undefined) shouldSkipWeekends = Boolean(automation.skipWeekends);
      }

      /** If date falls on Saturday or Sunday, push to the next Monday */
      function skipWeekend(date: Date): Date {
        if (!shouldSkipWeekends) return date;
        const day = date.getDay();
        if (day === 6) date.setDate(date.getDate() + 2);
        else if (day === 0) date.setDate(date.getDate() + 1);
        return date;
      }

      // 2b first: find campaigns with PENDING scheduled emails (these take priority)
      const pendingScheduled = await prisma.scheduledEmail.findMany({
        where: {
          ...(workspaceId ? { workspaceId } : {}),
          status: "PENDING",
          campaignId: { not: null },
        },
        select: {
          id: true,
          campaignId: true,
          scheduledFor: true,
        },
      });

      // Pre-fetch campaigns for pending scheduled follow-ups
      const pendingCampaignIds = [...new Set(pendingScheduled.map((se) => se.campaignId).filter(Boolean))] as string[];
      const pendingCampaigns = pendingCampaignIds.length > 0
        ? await prisma.campaign.findMany({
            where: { id: { in: pendingCampaignIds } },
            select: {
              id: true, name: true, followUpSubject: true, followUpBody: true,
              contacts: { select: { prospect: { select: { id: true, companyName: true, email: true, phone: true } } } },
            },
          })
        : [];
      const pendingCampaignMap = new Map(pendingCampaigns.map((c) => [c.id, c]));

      for (const se of pendingScheduled) {
        if (!se.campaignId) continue;

        const campaign = pendingCampaignMap.get(se.campaignId);
        if (!campaign || !campaign.followUpSubject) continue;
        const prospects = campaign.contacts.map((ct) => ct.prospect);

        for (let n = 0; n < maxFollowUps; n++) {
          const followUpDate = new Date(se.scheduledFor);
          followUpDate.setDate(followUpDate.getDate() + followUpDelayDays + n * followUpIntervalDays);
          skipWeekend(followUpDate);

          if (followUpDate >= fromDate && followUpDate <= toDate) {
            events.push({
              id: `fu_se_${se.id}_${n + 1}`,
              title: `${campaign.followUpSubject || `Follow-up: ${campaign.name}`} (#${n + 1})`,
              type: "followup",
              start: followUpDate.toISOString(),
              status: "PENDING",
              description: campaign.followUpBody?.substring(0, 200) || undefined,
              campaignId: campaign.id,
              campaignName: campaign.name,
              relatedProspects: prospects,
            });
          }
        }
      }

      // 2a. Follow-ups for already-sent campaigns (skip campaigns already handled by 2b)
      const campaignsWithPending = new Set(pendingCampaignIds);
      const sentCampaigns = await prisma.campaign.findMany({
        where: {
          ...(workspaceId ? { workspaceId } : {}),
          followUpSubject: { not: null },
          status: { in: ["ACTIVE", "COMPLETED"] },
          lastSentAt: { not: null },
        },
        select: {
          id: true,
          name: true,
          followUpSubject: true,
          followUpBody: true,
          lastSentAt: true,
          contacts: {
            select: {
              prospect: {
                select: { id: true, companyName: true, email: true, phone: true },
              },
            },
          },
        },
      });

      for (const c of sentCampaigns) {
        if (!c.lastSentAt) continue;
        // Skip if this campaign already has PENDING scheduled emails (2b handles it)
        if (campaignsWithPending.has(c.id)) continue;
        const prospects = c.contacts.map((ct) => ct.prospect);
        // Use lastSentAt timestamp in the event ID so follow-ups are unique per send
        const sendTs = c.lastSentAt.getTime();

        for (let n = 0; n < maxFollowUps; n++) {
          const followUpDate = new Date(c.lastSentAt);
          followUpDate.setDate(followUpDate.getDate() + followUpDelayDays + n * followUpIntervalDays);
          skipWeekend(followUpDate);

          if (followUpDate >= fromDate && followUpDate <= toDate) {
            events.push({
              id: `fu_${c.id}_${sendTs}_${n + 1}`,
              title: `${c.followUpSubject || `Follow-up: ${c.name}`} (#${n + 1})`,
              type: "followup",
              start: followUpDate.toISOString(),
              status: "PENDING",
              description: c.followUpBody?.substring(0, 200) || undefined,
              campaignId: c.id,
              campaignName: c.name,
              relatedProspects: prospects,
            });
          }
        }
      }
    }

    // 3. Tasks (gracefully handle missing table)
    if (types.includes("task")) {
      try {
        const tasks = await prisma.calendarTask.findMany({
          where: {
            ...(workspaceId ? { workspaceId } : {}),
            dueAt: { gte: fromDate, lte: toDate },
          },
          orderBy: { dueAt: "asc" },
        });

        // Pre-fetch related prospects and campaigns for tasks
        const taskProspectIds = [...new Set(tasks.map((t) => t.prospectId).filter(Boolean))] as string[];
        const taskCampaignIds = [...new Set(tasks.map((t) => t.campaignId).filter(Boolean))] as string[];

        const taskProspects = taskProspectIds.length > 0
          ? await prisma.prospect.findMany({
              where: { id: { in: taskProspectIds } },
              select: { id: true, companyName: true, email: true, phone: true },
            })
          : [];
        const taskProspectMap = new Map(taskProspects.map((p) => [p.id, p]));

        const taskCampaigns = taskCampaignIds.length > 0
          ? await prisma.campaign.findMany({
              where: { id: { in: taskCampaignIds } },
              select: { id: true, name: true },
            })
          : [];
        const taskCampaignMap = new Map(taskCampaigns.map((c) => [c.id, c]));

        for (const task of tasks) {
          let prospects: CalendarEvent["relatedProspects"] = [];
          let campaignName: string | undefined;

          if (task.prospectId) {
            const prospect = taskProspectMap.get(task.prospectId);
            if (prospect) prospects = [prospect];
          }

          if (task.campaignId) {
            const campaign = taskCampaignMap.get(task.campaignId);
            if (campaign) campaignName = campaign.name;
          }

          events.push({
            id: `task_${task.id}`,
            title: task.title,
            type: "task",
            start: task.dueAt.toISOString(),
            status: task.status,
            priority: task.priority,
            description: task.description || undefined,
            campaignId: task.campaignId || undefined,
            campaignName,
            relatedProspects: prospects,
          });
        }
      } catch {
        // CalendarTask table may not exist yet — continue without tasks
      }
    }

    // Filter out dismissed follow-ups (gracefully handle missing table)
    let dismissedKeys = new Set<string>();
    try {
      const dismissed = await prisma.dismissedFollowUp.findMany({
        where: { ...(workspaceId ? { workspaceId } : {}) },
        select: { eventKey: true },
      });
      dismissedKeys = new Set(dismissed.map((d) => d.eventKey));
    } catch {
      // Table may not exist yet — continue without filtering
    }
    const filtered = events.filter((e) => !dismissedKeys.has(e.id));

    // Sort all events by start date
    filtered.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

    return NextResponse.json(filtered);
  } catch (error) {
    console.error("Calendar events error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch calendar events" },
      { status: 500 }
    );
  }
}
