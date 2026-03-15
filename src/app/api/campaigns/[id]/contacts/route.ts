import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// GET: list all prospects with selection status for this campaign
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const contactType = searchParams.get("contactType") || "";
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "50", 10);

    // Build filter (exclude archived)
    const where: Record<string, unknown> = { archivedAt: null };
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
    console.error("Campaign contacts fetch error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch contacts" },
      { status: 500 }
    );
  }
}

// POST: add contacts to campaign
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { prospectIds } = body as { prospectIds: string[] };

    if (!prospectIds || !Array.isArray(prospectIds) || prospectIds.length === 0) {
      return NextResponse.json(
        { error: "prospectIds array is required" },
        { status: 400 }
      );
    }

    // Use createMany with skipDuplicates
    const result = await prisma.campaignContact.createMany({
      data: prospectIds.map((prospectId) => ({
        campaignId: id,
        prospectId,
      })),
      skipDuplicates: true,
    });

    return NextResponse.json({ added: result.count });
  } catch (error) {
    console.error("Campaign contacts add error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to add contacts" },
      { status: 500 }
    );
  }
}

// DELETE: remove contacts from campaign
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { prospectIds } = body as { prospectIds: string[] };

    if (!prospectIds || !Array.isArray(prospectIds) || prospectIds.length === 0) {
      return NextResponse.json(
        { error: "prospectIds array is required" },
        { status: 400 }
      );
    }

    const result = await prisma.campaignContact.deleteMany({
      where: {
        campaignId: id,
        prospectId: { in: prospectIds },
      },
    });

    return NextResponse.json({ removed: result.count });
  } catch (error) {
    console.error("Campaign contacts remove error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to remove contacts" },
      { status: 500 }
    );
  }
}
