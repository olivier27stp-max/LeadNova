import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireWorkspaceContext, handleWorkspaceError } from "@/lib/workspace";

// GET /api/pipeline/search?q= — prospects à ajouter au pipeline (nom, propriétaire, ville, courriel, téléphone)
export async function GET(request: NextRequest) {
  try {
    const { workspaceId } = await requireWorkspaceContext();
    const q = (request.nextUrl.searchParams.get("q") || "").trim().slice(0, 100);
    if (q.length < 2) return NextResponse.json({ results: [] });
    const contains = { contains: q, mode: "insensitive" as const };
    const results = await prisma.prospect.findMany({
      where: {
        workspaceId,
        archivedAt: null,
        OR: [{ companyName: contains }, { ownerName: contains }, { city: contains }, { email: contains }, { phone: { contains: q } }],
      },
      select: { id: true, companyName: true, ownerName: true, city: true, salesStage: true },
      orderBy: { companyName: "asc" },
      take: 10,
    });
    return NextResponse.json({ results });
  } catch (error) {
    return handleWorkspaceError(error);
  }
}
