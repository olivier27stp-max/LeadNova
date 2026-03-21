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

      for (const se of scheduledEmails) {
        let campaignName: string | undefined;
        let prospects: CalendarEvent["relatedProspects"] = [];

        if (se.campaignId) {
          const campaign = await prisma.campaign.findUnique({
            where: { id: se.campaignId },
            select: { name: true, contacts: { select: { prospect: { select: { id: true, companyName: true, email: true, phone: true } } } } },
          });
          if (campaign) {
            campaignName = campaign.name;
            prospects = campaign.contacts.map((c) => c.prospect);
          }
        }

        if (se.prospectId && prospects.length === 0) {
          const prospect = await prisma.prospect.findUnique({
            where: { id: se.prospectId },
            select: { id: true, companyName: true, email: true, phone: true },
          });
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

    // 2. Follow-ups (campaigns with followUpSubject set, that have been sent)
    if (types.includes("followup")) {
      const campaigns = await prisma.campaign.findMany({
        where: {
          ...(workspaceId ? { workspaceId } : {}),
          followUpSubject: { not: null },
          status: { in: ["ACTIVE", "COMPLETED"] },
        },
        select: {
          id: true,
          name: true,
          followUpSubject: true,
          followUpBody: true,
          lastSentAt: true,
          updatedAt: true,
          contacts: {
            select: {
              prospect: {
                select: { id: true, companyName: true, email: true, phone: true },
              },
            },
          },
        },
      });

      // Check settings for follow-up delay
      let followUpDelayDays = 3;
      if (workspaceId) {
        const settingsRow = await prisma.appSettings.findUnique({ where: { workspaceId } });
        const settings = (settingsRow?.data as Record<string, unknown>) || {};
        const automation = (settings.automation as Record<string, unknown>) || {};
        if (automation.followUpDelayDays) followUpDelayDays = automation.followUpDelayDays as number;
      }

      for (const c of campaigns) {
        if (!c.lastSentAt) continue;
        const followUpDate = new Date(c.lastSentAt);
        followUpDate.setDate(followUpDate.getDate() + followUpDelayDays);

        if (followUpDate >= fromDate && followUpDate <= toDate) {
          events.push({
            id: `fu_${c.id}`,
            title: c.followUpSubject || `Follow-up: ${c.name}`,
            type: "followup",
            start: followUpDate.toISOString(),
            status: "PENDING",
            description: c.followUpBody?.substring(0, 200) || undefined,
            campaignId: c.id,
            campaignName: c.name,
            relatedProspects: c.contacts.map((ct) => ct.prospect),
          });
        }
      }
    }

    // 3. Tasks
    if (types.includes("task")) {
      const tasks = await prisma.calendarTask.findMany({
        where: {
          ...(workspaceId ? { workspaceId } : {}),
          dueAt: { gte: fromDate, lte: toDate },
        },
        orderBy: { dueAt: "asc" },
      });

      for (const task of tasks) {
        let prospects: CalendarEvent["relatedProspects"] = [];
        let campaignName: string | undefined;

        if (task.prospectId) {
          const prospect = await prisma.prospect.findUnique({
            where: { id: task.prospectId },
            select: { id: true, companyName: true, email: true, phone: true },
          });
          if (prospect) prospects = [prospect];
        }

        if (task.campaignId) {
          const campaign = await prisma.campaign.findUnique({
            where: { id: task.campaignId },
            select: { name: true },
          });
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
    }

    // Sort all events by start date
    events.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

    return NextResponse.json(events);
  } catch (error) {
    console.error("Calendar events error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch calendar events" },
      { status: 500 }
    );
  }
}
