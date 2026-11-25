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

type OverviewRow = {
  id: string;
  contacts: bigint; with_email: bigint; with_phone: bigint; not_enriched: bigint;
  sent: bigint; contacted: bigint; opened: bigint; replied: bigint; positive: bigint; bounced: bigint;
  pending_sends: bigint;
};

// Aperçu par campagne (page Campagnes) : une seule requête agrégée pour toutes les campagnes du compte
async function campaignOverviews(workspaceId: string | null) {
  const map = new Map<string, Record<string, number>>();
  if (!workspaceId) return map;
  const rows = await prisma.$queryRaw<OverviewRow[]>`
    SELECT c.id,
      COALESCE(ct.contacts, 0) AS contacts,
      COALESCE(ct.with_email, 0) AS with_email,
      COALESCE(ct.with_phone, 0) AS with_phone,
      COALESCE(ct.not_enriched, 0) AS not_enriched,
      COALESCE(ea.sent, 0) AS sent,
      COALESCE(ea.contacted, 0) AS contacted,
      COALESCE(ea.opened, 0) AS opened,
      COALESCE(ea.replied, 0) AS replied,
      COALESCE(ea.positive, 0) AS positive,
      COALESCE(ea.bounced, 0) AS bounced,
      COALESCE(se.pending, 0) AS pending_sends
    FROM campaigns c
    LEFT JOIN (
      SELECT cc."campaignId",
        COUNT(*) AS contacts,
        COUNT(*) FILTER (WHERE p.email IS NOT NULL AND p.email <> '' AND NOT p."emailGuessed") AS with_email,
        COUNT(*) FILTER (WHERE p.phone IS NOT NULL AND p.phone <> '') AS with_phone,
        COUNT(*) FILTER (WHERE p."enrichedAt" IS NULL) AS not_enriched
      FROM campaign_contacts cc
      JOIN prospects p ON p.id = cc."prospectId" AND p."archivedAt" IS NULL
      GROUP BY cc."campaignId"
    ) ct ON ct."campaignId" = c.id
    LEFT JOIN (
      SELECT "campaignId",
        COUNT(*) AS sent,
        COUNT(DISTINCT "prospectId") AS contacted,
        COUNT(DISTINCT "prospectId") FILTER (WHERE "openedAt" IS NOT NULL) AS opened,
        COUNT(DISTINCT "prospectId") FILTER (WHERE "replyReceived") AS replied,
        COUNT(DISTINCT "prospectId") FILTER (WHERE "replySentiment" = 'positive') AS positive,
        COUNT(DISTINCT "prospectId") FILTER (WHERE bounce) AS bounced
      FROM email_activity
      WHERE "campaignId" IS NOT NULL
      GROUP BY "campaignId"
    ) ea ON ea."campaignId" = c.id
    LEFT JOIN (
      SELECT "campaignId", COUNT(*) AS pending
      FROM scheduled_emails
      WHERE status = 'PENDING' AND "campaignId" IS NOT NULL
      GROUP BY "campaignId"
    ) se ON se."campaignId" = c.id
    WHERE c."workspaceId" = ${workspaceId}
  `;
  for (const { id, ...counts } of rows) {
    map.set(id, Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, Number(v)])));
  }
  return map;
}

export async function GET(request: NextRequest) {
  try {
    const workspaceId = await getWorkspaceId();
    const campaigns = await prisma.campaign.findMany({
      where: { workspaceId: workspaceId ?? null },
      orderBy: { createdAt: "desc" },
    });
    if (request.nextUrl.searchParams.get("overview") === "1") {
      const overviews = await campaignOverviews(workspaceId ?? null);
      return NextResponse.json(campaigns.map((c) => ({ ...c, overview: overviews.get(c.id) ?? null })));
    }
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

    // Anti-doublon : même nom dans le même compte créé il y a moins de 15 s
    // (double-clic, Entrée répétée, requête renvoyée) → on renvoie celle qui existe déjà
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) {
      return NextResponse.json({ error: "Nom de campagne requis" }, { status: 400 });
    }
    // Verrou par compte (libéré à la fin de la transaction) : deux requêtes simultanées
    // passent l'une après l'autre, la 2e voit la campagne de la 1re et la renvoie.
    const { campaign, duplicate } = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"campaign-create:" + (workspaceId ?? "none")}))`;

      const recentSame = await tx.campaign.findFirst({
        where: {
          workspaceId: workspaceId ?? null,
          name,
          createdAt: { gte: new Date(Date.now() - 15_000) },
        },
        orderBy: { createdAt: "desc" },
      });
      if (recentSame) return { campaign: recentSame, duplicate: true };

      // Auto-assign next sequential number
      const lastCampaign = await tx.campaign.findFirst({
        where: { workspaceId: workspaceId ?? null },
        orderBy: { number: "desc" },
        select: { number: true },
      });
      const nextNumber = (lastCampaign?.number ?? 0) + 1;

      const created = await tx.campaign.create({
        data: {
          name,
          number: nextNumber,
          workspaceId: workspaceId ?? undefined,
          maxPerDay: body.maxPerDay || 30,
          delayMinSeconds: body.delayMinSeconds || 120,
          delayMaxSeconds: body.delayMaxSeconds || 300,
          requireApproval: body.requireApproval ?? true,
        },
      });
      return { campaign: created, duplicate: false };
    });

    if (duplicate) {
      return NextResponse.json(campaign, { status: 200 });
    }

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
    const workspaceId = await getWorkspaceId();
    const body = await request.json();
    const { id, ...data } = body;

    if (!id) {
      return NextResponse.json(
        { error: "Campaign id is required" },
        { status: 400 }
      );
    }

    // Verify workspace ownership
    const existing = await prisma.campaign.findFirst({
      where: { id, workspaceId: workspaceId ?? null },
    });
    if (!existing) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    // Only allow safe fields
    const allowedFields = ["name", "status", "emailSubject", "emailBody", "followUpSubject", "followUpBody", "maxPerDay", "delayMinSeconds", "delayMaxSeconds", "requireApproval"];
    const safeData: Record<string, unknown> = {};
    for (const key of allowedFields) {
      if (data[key] !== undefined) safeData[key] = data[key];
    }

    const campaign = await prisma.campaign.update({
      where: { id },
      data: safeData,
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
