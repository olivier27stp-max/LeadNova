import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireWorkspaceContext, handleWorkspaceError } from "@/lib/workspace";

// Helper: check if a prospect has any other pending scheduled emails
// (either directly via prospectId or indirectly via campaignId + CampaignContact)
async function hasOtherPendingScheduledEmails(prospectId: string, excludeScheduledEmailId: string): Promise<boolean> {
  // Check direct prospect-linked scheduled emails
  const directPending = await prisma.scheduledEmail.count({
    where: { prospectId, status: "PENDING", id: { not: excludeScheduledEmailId } },
  });
  if (directPending > 0) return true;

  // Check campaign-linked scheduled emails where this prospect is a contact
  const prospectCampaigns = await prisma.campaignContact.findMany({
    where: { prospectId },
    select: { campaignId: true },
  });
  if (prospectCampaigns.length > 0) {
    const campaignIds = prospectCampaigns.map((cc) => cc.campaignId);
    const campaignPending = await prisma.scheduledEmail.count({
      where: {
        campaignId: { in: campaignIds },
        status: "PENDING",
        id: { not: excludeScheduledEmailId },
      },
    });
    if (campaignPending > 0) return true;
  }

  return false;
}

// Helper: revert a prospect's SCHEDULED status to the correct previous status
async function revertScheduledStatus(prospectId: string, excludeScheduledEmailId: string): Promise<void> {
  const hasPending = await hasOtherPendingScheduledEmails(prospectId, excludeScheduledEmailId);
  if (hasPending) return; // Still has other pending sends, keep SCHEDULED

  // Check if the prospect was already contacted (has EmailActivity records)
  const emailCount = await prisma.emailActivity.count({
    where: { prospectId },
  });

  const newStatus = emailCount > 0 ? "CONTACTED" : "ENRICHED";

  await prisma.prospect.updateMany({
    where: { id: prospectId, status: "SCHEDULED" },
    data: { status: newStatus },
  });
}

// PATCH /api/scheduled-emails/[id] — reschedule or cancel
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireWorkspaceContext();
    const { id } = await params;
    const body = await request.json();

    const existing = await prisma.scheduledEmail.findFirst({ where: { id, workspaceId: ctx.workspaceId } });
    if (!existing) return NextResponse.json({ error: "Introuvable" }, { status: 404 });
    if (existing.status !== "PENDING") {
      return NextResponse.json({ error: "Seuls les envois en attente peuvent être modifiés." }, { status: 400 });
    }

    const data: Record<string, unknown> = {};

    if (body.scheduledFor) {
      const scheduled = new Date(body.scheduledFor);
      if (scheduled <= new Date()) {
        return NextResponse.json({ error: "La date planifiée doit être dans le futur." }, { status: 400 });
      }
      data.scheduledFor = scheduled;
    }
    if (body.timezone) data.timezone = body.timezone;
    if (body.status === "CANCELLED") {
      data.status = "CANCELLED";
      const prospectIdsToCheck: string[] = [];
      if (existing.campaignId) {
        const contacts = await prisma.campaignContact.findMany({
          where: { campaignId: existing.campaignId },
          select: { prospectId: true },
        });
        prospectIdsToCheck.push(...contacts.map((c) => c.prospectId));
      } else if (existing.prospectId) {
        prospectIdsToCheck.push(existing.prospectId);
      }

      for (const pid of prospectIdsToCheck) {
        await revertScheduledStatus(pid, id);
      }
    }

    const updated = await prisma.scheduledEmail.update({ where: { id }, data });
    return NextResponse.json(updated);
  } catch (error) {
    return handleWorkspaceError(error);
  }
}

// DELETE /api/scheduled-emails/[id]?dismissFollowUps=true — delete scheduled email + clean up follow-ups
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireWorkspaceContext();
    const { id } = await params;
    const dismissFollowUps = req.nextUrl.searchParams.get("dismissFollowUps") === "true";

    const existing = await prisma.scheduledEmail.findFirst({ where: { id, workspaceId: ctx.workspaceId } });
    if (!existing) return NextResponse.json({ error: "Introuvable" }, { status: 404 });

    // Revert prospect status from SCHEDULED to correct previous status
    // Use snapshot IDs when available, fall back to live campaign contacts
    let prospectIds: string[] = existing.snapshotProspectIds || [];
    if (prospectIds.length === 0) {
      if (existing.campaignId) {
        const contacts = await prisma.campaignContact.findMany({
          where: { campaignId: existing.campaignId },
          select: { prospectId: true },
        });
        prospectIds = contacts.map((c) => c.prospectId);
      } else if (existing.prospectId) {
        prospectIds = [existing.prospectId];
      }
    }

    for (const pid of prospectIds) {
      await revertScheduledStatus(pid, id);
    }

    // If linked to a campaign and caller wants to dismiss follow-ups too,
    // build dismiss keys BEFORE deleting (we need the record for context)
    if (existing.campaignId && dismissFollowUps) {
      try {
        const MAX_FOLLOWUPS = 10;

        // 1. Dismiss follow-ups derived from this scheduled email: fu_se_<seId>_N
        for (let i = 1; i <= MAX_FOLLOWUPS; i++) {
          const eventKey = `fu_se_${id}_${i}`;
          await prisma.dismissedFollowUp.upsert({
            where: { workspaceId_eventKey: { workspaceId: ctx.workspaceId, eventKey } },
            update: {},
            create: { workspaceId: ctx.workspaceId, eventKey },
          });
        }

        // 2. Dismiss follow-ups derived from campaign lastSentAt: fu_<campaignId>_<sendTs>_N
        const campaign = await prisma.campaign.findUnique({
          where: { id: existing.campaignId },
          select: { lastSentAt: true },
        });
        if (campaign?.lastSentAt) {
          const sendTs = campaign.lastSentAt.getTime();
          for (let i = 1; i <= MAX_FOLLOWUPS; i++) {
            const eventKey = `fu_${existing.campaignId}_${sendTs}_${i}`;
            await prisma.dismissedFollowUp.upsert({
              where: { workspaceId_eventKey: { workspaceId: ctx.workspaceId, eventKey } },
              update: {},
              create: { workspaceId: ctx.workspaceId, eventKey },
            });
          }
        }
      } catch {
        // table may not exist
      }
    }

    // Delete the scheduled email record
    await prisma.scheduledEmail.delete({ where: { id } });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleWorkspaceError(error);
  }
}
