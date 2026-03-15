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

    const prospectsWithSelection = prospects.map((p) => ({
      ...p,
      selected: selectedIds.has(p.id),
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
