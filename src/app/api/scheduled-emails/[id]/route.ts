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
      // Revert prospect status from SCHEDULED to ENRICHED
      if (existing.campaignId) {
        const contacts = await prisma.campaignContact.findMany({
          where: { campaignId: existing.campaignId },
          select: { prospectId: true },
        });
        for (const contact of contacts) {
          await prisma.prospect.updateMany({
            where: { id: contact.prospectId, status: "SCHEDULED" },
            data: { status: "ENRICHED" },
          });
        }
      } else if (existing.prospectId) {
        await prisma.prospect.updateMany({
          where: { id: existing.prospectId, status: "SCHEDULED" },
          data: { status: "ENRICHED" },
        });
      }
    }

    const updated = await prisma.scheduledEmail.update({ where: { id }, data });
    return NextResponse.json(updated);
  } catch (error) {
    return handleWorkspaceError(error);
  }
}

// DELETE /api/scheduled-emails/[id] — cancel
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireWorkspaceContext();
    const { id } = await params;

    const existing = await prisma.scheduledEmail.findFirst({ where: { id, workspaceId: ctx.workspaceId } });
    if (!existing) return NextResponse.json({ error: "Introuvable" }, { status: 404 });

    await prisma.scheduledEmail.update({
      where: { id },
      data: { status: "CANCELLED" },
    });

    // Revert prospect status from SCHEDULED to ENRICHED
    if (existing.campaignId) {
      const contacts = await prisma.campaignContact.findMany({
        where: { campaignId: existing.campaignId },
        select: { prospectId: true },
      });
      for (const contact of contacts) {
        await prisma.prospect.updateMany({
          where: { id: contact.prospectId, status: "SCHEDULED" },
          data: { status: "ENRICHED" },
        });
      }
    } else if (existing.prospectId) {
      await prisma.prospect.updateMany({
        where: { id: existing.prospectId, status: "SCHEDULED" },
        data: { status: "ENRICHED" },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleWorkspaceError(error);
  }
}
