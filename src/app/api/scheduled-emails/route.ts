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

  return NextResponse.json(emails);
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

    return NextResponse.json(scheduledEmail, { status: 201 });
  } catch (e) {
    console.error("[scheduled-emails POST]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erreur base de données" },
      { status: 500 }
    );
  }
}
