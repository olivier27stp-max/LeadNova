import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireWorkspaceContext, handleWorkspaceError } from "@/lib/workspace";
import {
  INDUSTRY_GROUPS,
  OTHER_INDUSTRY_GROUP,
  getIndustryGroup,
  industryGroupLabel,
} from "@/lib/industry-groups";

// GET /api/prospects/industry-groups — nombre de prospects par grand métier
export async function GET() {
  try {
    const ctx = await requireWorkspaceContext();
    const rows = await prisma.prospect.groupBy({
      by: ["industry"],
      where: { workspaceId: ctx.workspaceId, archivedAt: null },
      _count: { _all: true },
    });

    const counts: Record<string, number> = {};
    for (const r of rows) {
      const key = getIndustryGroup(r.industry);
      counts[key] = (counts[key] ?? 0) + r._count._all;
    }

    const groups = [...INDUSTRY_GROUPS.map((g) => g.key), OTHER_INDUSTRY_GROUP]
      .map((key) => ({ key, label: industryGroupLabel(key), count: counts[key] ?? 0 }))
      .filter((g) => g.count > 0);

    return NextResponse.json({ groups });
  } catch (error) {
    return handleWorkspaceError(error);
  }
}
