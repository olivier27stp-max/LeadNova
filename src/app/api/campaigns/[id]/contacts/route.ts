import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireWorkspaceContext, handleWorkspaceError } from "@/lib/workspace";

// GET: list all prospects with selection status for this campaign
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireWorkspaceContext();
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const contactType = searchParams.get("contactType") || "";
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "50", 10);

    // Verify campaign belongs to workspace
    const campaign = await prisma.campaign.findFirst({
      where: { id, workspaceId: ctx.workspaceId },
      select: { id: true },
    });
    if (!campaign) {
      return NextResponse.json({ error: "Campagne introuvable" }, { status: 404 });
    }

    // Build filter — scope to workspace, exclude archived
    const where: Record<string, unknown> = { archivedAt: null, workspaceId: ctx.workspaceId };
    if (contactType) {
      where.contactType = contactType;
    }
    if (search) {
      where.OR = [
        { companyName: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { city: { contains: search, mode: "insensitive" } },
      ];
    }

    // Sequential queries to avoid connection pool exhaustion
    const prospects = await prisma.prospect.findMany({
      where,
      orderBy: { leadScore: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        companyName: true,
        email: true,
        city: true,
        status: true,
        contactType: true,
        leadScore: true,
      },
    });
    const total = await prisma.prospect.count({ where });
    const selectedContacts = await prisma.campaignContact.findMany({
      where: { campaignId: id },
      select: { prospectId: true },
    });

    const selectedIds = new Set(selectedContacts.map((c) => c.prospectId));

    // Find prospects already emailed in this campaign (for "double" detection)
    const alreadyEmailed = await prisma.emailActivity.findMany({
      where: { campaignId: id },
      select: { prospectId: true },
      distinct: ["prospectId"],
    });
    const alreadyEmailedIds = new Set(alreadyEmailed.map((e) => e.prospectId));

    // Fix orphaned SCHEDULED statuses: prospects marked SCHEDULED but with no pending scheduled sends
    const scheduledProspects = prospects.filter((p) => p.status === "SCHEDULED");
    if (scheduledProspects.length > 0) {
      const scheduledIds = scheduledProspects.map((p) => p.id);

      // Check which of these actually have pending scheduled emails (direct or via campaign)
      const directPending = await prisma.scheduledEmail.findMany({
        where: { prospectId: { in: scheduledIds }, status: "PENDING" },
        select: { prospectId: true },
      });
      const directPendingIds = new Set(directPending.map((se) => se.prospectId));

      // Check campaign-linked pending scheduled emails
      const campaignLinks = await prisma.campaignContact.findMany({
        where: { prospectId: { in: scheduledIds } },
        select: { prospectId: true, campaignId: true },
      });
      const campaignIds = [...new Set(campaignLinks.map((cl) => cl.campaignId))];
      const campaignPending = campaignIds.length > 0
        ? await prisma.scheduledEmail.findMany({
            where: { campaignId: { in: campaignIds }, status: "PENDING" },
            select: { campaignId: true },
          })
        : [];
      const pendingCampaignIds = new Set(campaignPending.map((se) => se.campaignId));
      const campaignPendingProspectIds = new Set(
        campaignLinks
          .filter((cl) => pendingCampaignIds.has(cl.campaignId))
          .map((cl) => cl.prospectId)
      );

      // Find orphans: SCHEDULED but no pending sends anywhere
      const orphanIds = scheduledIds.filter(
        (pid) => !directPendingIds.has(pid) && !campaignPendingProspectIds.has(pid)
      );

      if (orphanIds.length > 0) {
        // Determine correct status per orphan: CONTACTED if has email activity, else ENRICHED
        const emailedOrphans = await prisma.emailActivity.findMany({
          where: { prospectId: { in: orphanIds } },
          select: { prospectId: true },
          distinct: ["prospectId"],
        });
        const emailedOrphanIds = new Set(emailedOrphans.map((e) => e.prospectId));

        const toContacted = orphanIds.filter((pid) => emailedOrphanIds.has(pid));
        const toEnriched = orphanIds.filter((pid) => !emailedOrphanIds.has(pid));

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

        // Update in-memory data for this response
        for (const p of prospects) {
          if (toContacted.includes(p.id)) (p as Record<string, unknown>).status = "CONTACTED";
          if (toEnriched.includes(p.id)) (p as Record<string, unknown>).status = "ENRICHED";
        }
      }
    }

    const prospectsWithSelection = prospects.map((p) => ({
      ...p,
      selected: selectedIds.has(p.id),
      alreadyEmailed: alreadyEmailedIds.has(p.id),
    }));

    return NextResponse.json({
      prospects: prospectsWithSelection,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      selectedCount: selectedContacts.length,
    });
  } catch (error) {
    return handleWorkspaceError(error);
  }
}

// POST: add contacts to campaign
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireWorkspaceContext();
    const { id } = await params;
    const body = await request.json();
    const { prospectIds } = body as { prospectIds: string[] };

    if (!prospectIds || !Array.isArray(prospectIds) || prospectIds.length === 0) {
      return NextResponse.json(
        { error: "prospectIds array is required" },
        { status: 400 }
      );
    }

    // Verify campaign belongs to workspace
    const campaign = await prisma.campaign.findFirst({
      where: { id, workspaceId: ctx.workspaceId },
      select: { id: true },
    });
    if (!campaign) {
      return NextResponse.json({ error: "Campagne introuvable" }, { status: 404 });
    }

    const result = await prisma.campaignContact.createMany({
      data: prospectIds.map((prospectId) => ({
        campaignId: id,
        prospectId,
      })),
      skipDuplicates: true,
    });

    return NextResponse.json({ added: result.count });
  } catch (error) {
    return handleWorkspaceError(error);
  }
}

// PUT: select all / deselect all contacts
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireWorkspaceContext();
    const { id } = await params;
    const body = await request.json();
    const { action, contactType, search } = body as {
      action: "selectAll" | "deselectAll";
      contactType?: string;
      search?: string;
    };

    // Verify campaign belongs to workspace
    const campaign = await prisma.campaign.findFirst({
      where: { id, workspaceId: ctx.workspaceId },
      select: { id: true },
    });
    if (!campaign) {
      return NextResponse.json({ error: "Campagne introuvable" }, { status: 404 });
    }

    if (action === "selectAll") {
      // Build same filter as GET
      const where: Record<string, unknown> = { archivedAt: null, workspaceId: ctx.workspaceId };
      if (contactType) where.contactType = contactType;
      if (search) {
        where.OR = [
          { companyName: { contains: search, mode: "insensitive" } },
          { email: { contains: search, mode: "insensitive" } },
          { city: { contains: search, mode: "insensitive" } },
        ];
      }

      const allProspects = await prisma.prospect.findMany({
        where,
        select: { id: true },
      });

      const result = await prisma.campaignContact.createMany({
        data: allProspects.map((p) => ({
          campaignId: id,
          prospectId: p.id,
        })),
        skipDuplicates: true,
      });

      return NextResponse.json({ added: result.count, total: allProspects.length });
    } else {
      // deselectAll
      const result = await prisma.campaignContact.deleteMany({
        where: { campaignId: id },
      });
      return NextResponse.json({ removed: result.count });
    }
  } catch (error) {
    return handleWorkspaceError(error);
  }
}

// DELETE: remove contacts from campaign
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireWorkspaceContext();
    const { id } = await params;
    const body = await request.json();
    const { prospectIds } = body as { prospectIds: string[] };

    if (!prospectIds || !Array.isArray(prospectIds) || prospectIds.length === 0) {
      return NextResponse.json(
        { error: "prospectIds array is required" },
        { status: 400 }
      );
    }

    // Verify campaign belongs to workspace
    const campaign = await prisma.campaign.findFirst({
      where: { id, workspaceId: ctx.workspaceId },
      select: { id: true },
    });
    if (!campaign) {
      return NextResponse.json({ error: "Campagne introuvable" }, { status: 404 });
    }

    const result = await prisma.campaignContact.deleteMany({
      where: {
        campaignId: id,
        prospectId: { in: prospectIds },
      },
    });

    return NextResponse.json({ removed: result.count });
  } catch (error) {
    return handleWorkspaceError(error);
  }
}
