import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireWorkspaceContext, handleWorkspaceError } from "@/lib/workspace";

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
        const otherPending = await prisma.scheduledEmail.count({
          where: { prospectId: pid, status: "PENDING", id: { not: id } },
        });
        if (otherPending === 0) {
          await prisma.prospect.updateMany({
            where: { id: pid, status: "SCHEDULED" },
            data: { status: "ENRICHED" },
          });
        }
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

    // Revert prospect status from SCHEDULED to ENRICHED (only if no other pending emails)
    const prospectIds: string[] = [];
    if (existing.campaignId) {
      const contacts = await prisma.campaignContact.findMany({
        where: { campaignId: existing.campaignId },
        select: { prospectId: true },
      });
      prospectIds.push(...contacts.map((c) => c.prospectId));
    } else if (existing.prospectId) {
      prospectIds.push(existing.prospectId);
    }

    for (const pid of prospectIds) {
      const otherPending = await prisma.scheduledEmail.count({
        where: { prospectId: pid, status: "PENDING", id: { not: id } },
      });
      if (otherPending === 0) {
        await prisma.prospect.updateMany({
          where: { id: pid, status: "SCHEDULED" },
          data: { status: "ENRICHED" },
        });
      }
    }

    // Delete the scheduled email — this removes the source for section 2b follow-ups
    // (fu_se_<id>_N), so they won't be generated anymore. No dismiss entries needed.
    await prisma.scheduledEmail.delete({ where: { id } });

    // If linked to a campaign and caller wants to dismiss follow-ups too
    if (existing.campaignId && dismissFollowUps) {
      // Dismiss all campaign follow-ups (fu_<campaignId>_N) so they disappear from calendar
      try {
        for (let i = 1; i <= 10; i++) {
          const eventKey = `fu_${existing.campaignId}_${i}`;
          await prisma.dismissedFollowUp.upsert({
            where: { workspaceId_eventKey: { workspaceId: ctx.workspaceId, eventKey } },
            update: {},
            create: { workspaceId: ctx.workspaceId, eventKey },
          });
        }
      } catch {
        // table may not exist
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleWorkspaceError(error);
  }
}
