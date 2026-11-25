import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getWorkspaceContext } from "@/lib/workspace";
import { logActivity } from "@/lib/activity";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getWorkspaceContext();
    if (!ctx) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }
    const { id } = await params;

    const campaign = await prisma.campaign.findFirst({
      where: {
        id,
        workspaceId: ctx.workspaceId,
      },
      include: {
        contacts: {
          include: {
            prospect: {
              select: {
                id: true,
                companyName: true,
                email: true,
                city: true,
                status: true,
                contactType: true,
              },
            },
          },
        },
      },
    });

    if (!campaign) {
      return NextResponse.json(
        { error: "Campaign not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(campaign);
  } catch (error) {
    console.error("Campaign fetch error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch campaign" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getWorkspaceContext();
    if (!ctx) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }
    const { id } = await params;
    const body = await request.json();

    // Verify workspace ownership
    const existing = await prisma.campaign.findFirst({
      where: { id, workspaceId: ctx.workspaceId },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    const campaign = await prisma.campaign.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.status !== undefined && { status: body.status }),
        ...(body.emailSubject !== undefined && { emailSubject: body.emailSubject }),
        ...(body.emailBody !== undefined && { emailBody: body.emailBody }),
        ...(body.emailSubjectNoForm !== undefined && { emailSubjectNoForm: body.emailSubjectNoForm }),
        ...(body.emailBodyNoForm !== undefined && { emailBodyNoForm: body.emailBodyNoForm }),
        ...(body.followUpSubject !== undefined && { followUpSubject: body.followUpSubject }),
        ...(body.followUpBody !== undefined && { followUpBody: body.followUpBody }),
        ...(body.followUps !== undefined && { followUps: body.followUps }),
        ...(body.maxPerDay !== undefined && { maxPerDay: body.maxPerDay }),
        ...(body.delayMinSeconds !== undefined && { delayMinSeconds: body.delayMinSeconds }),
        ...(body.delayMaxSeconds !== undefined && { delayMaxSeconds: body.delayMaxSeconds }),
        ...(body.requireApproval !== undefined && { requireApproval: body.requireApproval }),
      },
    });

    return NextResponse.json(campaign);
  } catch (error) {
    console.error("Campaign update error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update campaign" },
      { status: 500 }
    );
  }
}

// DELETE /api/campaigns/[id] — supprime la campagne.
// Les prospects restent (seul leur lien avec la campagne part) ; l'historique des courriels
// envoyés est gardé (campaignId → null) ; les envois planifiés pas encore partis sont annulés.
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getWorkspaceContext();
    if (!ctx) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }
    const { id } = await params;

    const campaign = await prisma.campaign.findFirst({
      where: { id, workspaceId: ctx.workspaceId },
      select: { id: true, number: true, name: true, _count: { select: { contacts: true } } },
    });
    if (!campaign) {
      return NextResponse.json({ error: "Campagne introuvable" }, { status: 404 });
    }

    // Un envoi est en train de partir : on attend qu'il finisse plutôt que de couper au milieu
    const processing = await prisma.scheduledEmail.count({ where: { campaignId: id, status: "PROCESSING" } });
    if (processing > 0) {
      return NextResponse.json(
        { error: "Un envoi de cette campagne est en cours. Réessayez dans quelques minutes." },
        { status: 409 }
      );
    }

    const cancelled = await prisma.scheduledEmail.updateMany({
      where: { campaignId: id, status: "PENDING" },
      data: { status: "CANCELLED", error: "Campagne supprimée" },
    });
    await prisma.calendarTask.updateMany({ where: { campaignId: id }, data: { campaignId: null } });
    // Contacts de la campagne : supprimés en cascade ; email_activity.campaignId : mis à null (historique gardé)
    await prisma.campaign.delete({ where: { id } });

    await logActivity({
      action: "campaign_deleted",
      type: "warning",
      title: "Campagne supprimée",
      details: `#${campaign.number} ${campaign.name} — ${campaign._count.contacts} prospect(s) retirés de la campagne, ${cancelled.count} envoi(s) planifié(s) annulé(s)`,
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      metadata: { campaign_id: id, campaign_name: campaign.name, contacts: campaign._count.contacts, cancelled_sends: cancelled.count },
    });

    return NextResponse.json({ deleted: true, contacts: campaign._count.contacts, cancelledSends: cancelled.count });
  } catch (error) {
    console.error("Campaign delete error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Échec de la suppression" },
      { status: 500 }
    );
  }
}
