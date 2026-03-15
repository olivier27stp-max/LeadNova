import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getWorkspaceContext } from "@/lib/workspace";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getWorkspaceContext();
    const { id } = await params;

    const campaign = await prisma.campaign.findUnique({
      where: { id },
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

    // Verify workspace ownership if user is authenticated
    if (ctx && campaign.workspaceId && campaign.workspaceId !== ctx.workspaceId) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
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
    const { id } = await params;
    const body = await request.json();

    // Verify workspace ownership
    if (ctx) {
      const existing = await prisma.campaign.findUnique({ where: { id }, select: { workspaceId: true } });
      if (existing?.workspaceId && existing.workspaceId !== ctx.workspaceId) {
        return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
      }
    }

    const campaign = await prisma.campaign.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.status !== undefined && { status: body.status }),
        ...(body.emailSubject !== undefined && { emailSubject: body.emailSubject }),
        ...(body.emailBody !== undefined && { emailBody: body.emailBody }),
        ...(body.followUpSubject !== undefined && { followUpSubject: body.followUpSubject }),
        ...(body.followUpBody !== undefined && { followUpBody: body.followUpBody }),
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
