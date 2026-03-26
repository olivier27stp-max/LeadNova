import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireWorkspaceContext, handleWorkspaceError } from "@/lib/workspace";

// Bulk revert: for all given prospect IDs, revert SCHEDULED status in 3 queries total
async function bulkRevertScheduledStatus(prospectIds: string[], excludeScheduledEmailId: string): Promise<void> {
  if (prospectIds.length === 0) return;

  // 1. Find which prospects still have OTHER pending scheduled emails (keep them SCHEDULED)
  //    Check both direct prospect-linked and campaign-linked scheduled emails
  const otherPendingDirect = await prisma.scheduledEmail.findMany({
    where: { prospectId: { in: prospectIds }, status: "PENDING", id: { not: excludeScheduledEmailId } },
    select: { prospectId: true },
  });

  // Also check campaign-linked: find campaigns these prospects belong to
  const prospectCampaigns = await prisma.campaignContact.findMany({
    where: { prospectId: { in: prospectIds } },
    select: { prospectId: true, campaignId: true },
  });
  const campaignIds = [...new Set(prospectCampaigns.map((cc) => cc.campaignId))];
  const campaignPending = campaignIds.length > 0
    ? await prisma.scheduledEmail.findMany({
        where: { campaignId: { in: campaignIds }, status: "PENDING", id: { not: excludeScheduledEmailId } },
        select: { campaignId: true },
      })
    : [];
  const pendingCampaignIds = new Set(campaignPending.map((se) => se.campaignId));
  const prospectIdsWithCampaignPending = new Set(
    prospectCampaigns.filter((cc) => pendingCampaignIds.has(cc.campaignId)).map((cc) => cc.prospectId)
  );

  const keepScheduled = new Set([
    ...otherPendingDirect.map((se) => se.prospectId).filter(Boolean),
    ...prospectIdsWithCampaignPending,
  ]);

  const idsToRevert = prospectIds.filter((id) => !keepScheduled.has(id));
  if (idsToRevert.length === 0) return;

  // 2. Find which of these have email history (→ CONTACTED) vs none (→ ENRICHED)
  const withEmails = await prisma.emailActivity.findMany({
    where: { prospectId: { in: idsToRevert } },
    distinct: ["prospectId"],
    select: { prospectId: true },
  });
  const contactedIds = new Set(withEmails.map((e) => e.prospectId));

  const toContacted = idsToRevert.filter((id) => contactedIds.has(id));
  const toEnriched = idsToRevert.filter((id) => !contactedIds.has(id));

  // 3. Bulk update in 2 queries
  if (toContacted.length > 0) {
    await prisma.prospect.updateMany({
      where: { id: { in: toContacted }, status: "SCHEDULED" },
      data: { status: "CONTACTED" },
    });
  }
  if (toEnriched.length > 0) {
    await prisma.prospect.updateMany({
      where: { id: { in: toEnriched }, status: "SCHEDULED" },
      data: { status: "ENRICHED" },
    });
  }
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
      let prospectIdsToCheck: string[] = existing.snapshotProspectIds || [];
      if (prospectIdsToCheck.length === 0) {
        if (existing.campaignId) {
          const contacts = await prisma.campaignContact.findMany({
            where: { campaignId: existing.campaignId },
            select: { prospectId: true },
          });
          prospectIdsToCheck = contacts.map((c) => c.prospectId);
        } else if (existing.prospectId) {
          prospectIdsToCheck = [existing.prospectId];
        }
      }

      await bulkRevertScheduledStatus(prospectIdsToCheck, id);
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

    // Revert prospect status from SCHEDULED to correct previous status (bulk)
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

    await bulkRevertScheduledStatus(prospectIds, id);

    // If linked to a campaign and caller wants to dismiss follow-ups too,
    // build dismiss keys BEFORE deleting (we need the record for context)
    if (existing.campaignId && dismissFollowUps) {
      try {
        const MAX_FOLLOWUPS = 10;
        const dismissKeys: string[] = [];

        // 1. Follow-ups derived from this scheduled email: fu_se_<seId>_N
        for (let i = 1; i <= MAX_FOLLOWUPS; i++) {
          dismissKeys.push(`fu_se_${id}_${i}`);
        }

        // 2. Follow-ups derived from campaign lastSentAt: fu_<campaignId>_<sendTs>_N
        const campaign = await prisma.campaign.findUnique({
          where: { id: existing.campaignId },
          select: { lastSentAt: true },
        });
        if (campaign?.lastSentAt) {
          const sendTs = campaign.lastSentAt.getTime();
          for (let i = 1; i <= MAX_FOLLOWUPS; i++) {
            dismissKeys.push(`fu_${existing.campaignId}_${sendTs}_${i}`);
          }
        }

        // Bulk insert all dismiss keys (skip duplicates)
        await prisma.dismissedFollowUp.createMany({
          data: dismissKeys.map((eventKey) => ({
            workspaceId: ctx.workspaceId,
            eventKey,
          })),
          skipDuplicates: true,
        });
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
