import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { getSessionUser } from "@/lib/session";
import { getActiveWorkspaceId } from "@/lib/workspace";

async function getWorkspaceId() {
  const user = await getSessionUser();
  if (!user) return null;
  return getActiveWorkspaceId(user.id);
}

export async function GET() {
  try {
    const workspaceId = await getWorkspaceId();
    const campaigns = await prisma.campaign.findMany({
      where: workspaceId ? { workspaceId } : undefined,
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(campaigns);
  } catch (error) {
    console.error("Campaigns fetch error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch campaigns" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const workspaceId = await getWorkspaceId();

    const campaign = await prisma.campaign.create({
      data: {
        name: body.name,
        workspaceId: workspaceId ?? undefined,
        maxPerDay: body.maxPerDay || 30,
        delayMinSeconds: body.delayMinSeconds || 120,
        delayMaxSeconds: body.delayMaxSeconds || 300,
        requireApproval: body.requireApproval ?? true,
      },
    });

    await logActivity({
      action: "campaign_created",
      type: "success",
      title: "Campagne créée",
      details: campaign.name,
      workspaceId: workspaceId ?? undefined,
      relatedEntityType: "campaign",
      relatedEntityId: campaign.id,
      metadata: { campaign_name: campaign.name },
    });

    return NextResponse.json(campaign, { status: 201 });
  } catch (error) {
    console.error("Campaign create error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create campaign" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, ...data } = body;

    if (!id) {
      return NextResponse.json(
        { error: "Campaign id is required" },
        { status: 400 }
      );
    }

    const campaign = await prisma.campaign.update({
      where: { id },
      data,
    });

    if (data.status) {
      const actionMap: Record<string, string> = {
        ACTIVE: "campaign_activated",
        PAUSED: "campaign_paused",
        COMPLETED: "campaign_updated",
        DRAFT: "campaign_updated",
      };
      const titleMap: Record<string, string> = {
        ACTIVE: "Campagne activée",
        PAUSED: "Campagne en pause",
        COMPLETED: "Campagne terminée",
        DRAFT: "Campagne en brouillon",
      };
      await logActivity({
        action: actionMap[data.status] || "campaign_updated",
        type: "info",
        title: titleMap[data.status] || "Campagne modifiée",
        details: campaign.name,
        relatedEntityType: "campaign",
        relatedEntityId: campaign.id,
        metadata: { campaign_name: campaign.name, status: data.status },
      });
    }

    return NextResponse.json(campaign);
  } catch (error) {
    console.error("Campaign update error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update campaign" },
      { status: 500 }
    );
  }
}
