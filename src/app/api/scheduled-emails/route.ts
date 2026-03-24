import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getWorkspaceContext } from "@/lib/workspace";

// GET /api/scheduled-emails?campaignId=xxx
export async function GET(request: NextRequest) {
  const ctx = await getWorkspaceContext();
  const workspaceId = ctx?.workspaceId ?? null;

  const { searchParams } = new URL(request.url);
  const campaignId = searchParams.get("campaignId");
  const prospectId = searchParams.get("prospectId");
  const status = searchParams.get("status");

  const where: Record<string, unknown> = {};
  if (workspaceId) where.workspaceId = workspaceId;
  if (campaignId) where.campaignId = campaignId;
  if (prospectId) where.prospectId = prospectId;
  if (status) where.status = status;

  const emails = await prisma.scheduledEmail.findMany({
    where,
    orderBy: { scheduledFor: "asc" },
  });

  // Load automation settings for follow-up count
  let maxFollowUps = 0;
  if (workspaceId) {
    const settingsRow = await prisma.appSettings.findUnique({ where: { workspaceId } });
    const settings = (settingsRow?.data as Record<string, unknown>) || {};
    const automation = (settings.automation as Record<string, unknown>) || {};
    if (automation.autoFollowUp !== false) {
      maxFollowUps = (automation.maxFollowUps as number) || 3;
    }
  }

  // Enrich with contact counts and follow-up counts
  const enriched = [];
  for (const email of emails) {
    let contactCount = 0;
    let followUpCount = 0;
    if (email.campaignId) {
      contactCount = await prisma.campaignContact.count({
        where: { campaignId: email.campaignId },
      });
      // Count configured follow-up templates for this campaign
      const campaign = await prisma.campaign.findUnique({
        where: { id: email.campaignId },
        select: { followUps: true, followUpSubject: true, followUpBody: true },
      });
      if (campaign) {
        const raw = campaign.followUps as unknown;
        let templateCount = 0;
        if (Array.isArray(raw)) {
          templateCount = raw.filter((f: { subject?: string; body?: string }) => f.subject || f.body).length;
        }
        if (templateCount === 0 && campaign.followUpSubject && campaign.followUpBody) {
          templateCount = 1;
        }
        followUpCount = Math.min(templateCount, maxFollowUps);
      }
    } else if (email.prospectId) {
      contactCount = 1;
    }
    enriched.push({ ...email, contactCount, followUpCount });
  }

  return NextResponse.json(enriched);
}

// POST /api/scheduled-emails
export async function POST(request: NextRequest) {
  const ctx = await getWorkspaceContext();
  const workspaceId = ctx?.workspaceId ?? null;

  const body = await request.json();
  const { campaignId, prospectId, subject, body: emailBody, scheduledFor, timezone } = body;

  if (!scheduledFor) {
    return NextResponse.json({ error: "scheduledFor requis" }, { status: 400 });
  }
  if (!campaignId && !prospectId) {
    return NextResponse.json({ error: "campaignId ou prospectId requis" }, { status: 400 });
  }

  const scheduled = new Date(scheduledFor);
  if (scheduled <= new Date()) {
    return NextResponse.json({ error: "La date planifiée doit être dans le futur." }, { status: 400 });
  }

  try {
    const scheduledEmail = await prisma.scheduledEmail.create({
      data: {
        workspaceId,
        campaignId: campaignId || null,
        prospectId: prospectId || null,
        subject: subject || null,
        body: emailBody || null,
        scheduledFor: scheduled,
        timezone: timezone || "America/Toronto",
        status: "PENDING",
      },
    });

    // Update campaign contacts' prospect status to SCHEDULED
    if (campaignId) {
      const contacts = await prisma.campaignContact.findMany({
        where: { campaignId },
        select: { prospectId: true },
      });
      for (const contact of contacts) {
        await prisma.prospect.update({
          where: { id: contact.prospectId },
          data: { status: "SCHEDULED" },
        });
      }
    } else if (prospectId) {
      await prisma.prospect.update({
        where: { id: prospectId },
        data: { status: "SCHEDULED" },
      });
    }

    // Clear any stale dismissed follow-ups for this campaign so they appear fresh
    if (campaignId && workspaceId) {
      try {
        await prisma.dismissedFollowUp.deleteMany({
          where: {
            workspaceId,
            eventKey: { startsWith: `fu_${campaignId}_` },
          },
        });
      } catch {
        // table may not exist yet
      }
    }

    return NextResponse.json(scheduledEmail, { status: 201 });
  } catch (e) {
    console.error("[scheduled-emails POST]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erreur base de données" },
      { status: 500 }
    );
  }
}
