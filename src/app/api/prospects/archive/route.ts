import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getWorkspaceContext } from "@/lib/workspace";

// GET archived prospects
export async function GET(request: NextRequest) {
  try {
    const ctx = await getWorkspaceContext();
    const workspaceId = ctx?.workspaceId ?? null;

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 500);

    const where = {
      archivedAt: { not: null },
      ...(workspaceId ? { workspaceId } : {}),
    };

    const total = await prisma.prospect.count({ where });
    const prospects = await prisma.prospect.findMany({
      where,
      orderBy: { archivedAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        companyName: true,
        city: true,
        email: true,
        phone: true,
        website: true,
        status: true,
        leadScore: true,
        source: true,
        contactType: true,
        archivedAt: true,
      },
    });

    return NextResponse.json({
      prospects,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error("Archive fetch error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur" },
      { status: 500 }
    );
  }
}

// POST: restore or permanently delete archived prospects
export async function POST(request: NextRequest) {
  try {
    const ctx = await getWorkspaceContext();
    const workspaceId = ctx?.workspaceId ?? null;
    const workspaceFilter = workspaceId ? { workspaceId } : {};

    const body = await request.json();

    // Restore prospects
    if (body._action === "restore") {
      const ids: string[] = body.ids || [];
      if (ids.length === 0) {
        return NextResponse.json({ error: "No ids" }, { status: 400 });
      }
      const result = await prisma.prospect.updateMany({
        where: { id: { in: ids }, archivedAt: { not: null }, ...workspaceFilter },
        data: { archivedAt: null },
      });
      return NextResponse.json({ restored: result.count });
    }

    // Permanently delete
    if (body._action === "permanentDelete") {
      const ids: string[] = body.ids || [];
      if (ids.length === 0) {
        return NextResponse.json({ error: "No ids" }, { status: 400 });
      }
      await prisma.emailActivity.deleteMany({ where: { prospectId: { in: ids } } });
      const result = await prisma.prospect.deleteMany({
        where: { id: { in: ids }, archivedAt: { not: null }, ...workspaceFilter },
      });
      return NextResponse.json({ deleted: result.count });
    }

    // Auto-cleanup: permanently delete prospects archived > 15 days ago
    if (body._action === "cleanup") {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 15);

      const toDelete = await prisma.prospect.findMany({
        where: { archivedAt: { not: null, lt: cutoff }, ...workspaceFilter },
        select: { id: true },
      });
      const ids = toDelete.map((p) => p.id);

      if (ids.length > 0) {
        await prisma.emailActivity.deleteMany({ where: { prospectId: { in: ids } } });
        await prisma.prospect.deleteMany({ where: { id: { in: ids } } });
      }

      return NextResponse.json({ deleted: ids.length });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("Archive action error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur" },
      { status: 500 }
    );
  }
}
